import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
export const db = getFirestore(app);
