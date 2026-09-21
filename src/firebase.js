import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth"
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, getFirestore } from "firebase/firestore";

// Paste your Firebase project's config here.
// Firebase Console → Project settings → General → "Your apps" → SDK setup and configuration
const firebaseConfig = {
  apiKey: "AIzaSyDB6zYAHvi0oTkObv-qDnP6nn0UUnscby0",
  authDomain: "moneybook-50481.firebaseapp.com",
  projectId: "moneybook-50481",
  storageBucket: "moneybook-50481.firebasestorage.app",
  messagingSenderId: "549256761796",
  appId: "1:549256761796:web:254332f109e7b8ad871491",
  measurementId: "G-XTDYYS4HK6"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline persistence (IndexedDB): lets the app show last-seen data
// immediately on load instead of waiting on the network every time, which
// is what makes "載入帳本中…" drag on, especially on mobile where the
// browser tends to discard background tabs and force a full reload.
// persistentSingleTabManager keeps this simple (one active tab owns the
// cache) since this app isn't expected to run in multiple tabs at once.
// IMPORTANT: this only affects how fast *reads* can show something on
// screen. It does NOT by itself make it safe to write on top of that
// cached data — App.jsx gates every write on Firestore's snapshot metadata
// (fromCache / hasPendingWrites) before allowing a save, specifically so a
// stale local cache can never overwrite newer data saved from another
// device or session.
//
// initializeFirestore() with persistentLocalCache can throw SYNCHRONOUSLY
// in some browsers/modes — e.g. Safari private browsing, or a device with
// storage access locked down — because it runs at module load time
// (before React even starts), an uncaught throw here breaks the entire
// app before anything renders (stuck on the very first loading screen,
// same on every reload, with no way to recover). So this falls back to a
// plain Firestore instance with no offline cache if that happens, trading
// away the faster offline-first loading rather than breaking the app.
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
  });
} catch (e) {
  console.warn("Firestore 離線快取無法啟用，改用一般模式（無離線快取）：", e);
  firestoreDb = getFirestore(app);
}
export const db = firestoreDb;
