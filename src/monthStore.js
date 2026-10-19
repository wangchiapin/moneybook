// 支出的雲端存放方式：「每月一份、月內每筆各占一格」
//
//   ledgers/{uid}/months/{YYYY-MM}  →  { items: { <支出編號>: { …那一筆支出… }, … } }
//
// 為什麼這樣存：
//  1. 以前所有支出都放在同一份文件的陣列裡，每次新增都把「整個陣列」寫回去。
//     兩台裝置同時改、或離線改完再上線，後寫的會整份蓋掉先寫的。
//     現在每一筆只寫自己那一格（items.<編號>），不會動到別筆，所以可以放心離線記帳。
//  2. Firestore 單一文件上限 1 MiB，資料越記越多遲早會爆；分成每月一份就不會。
//  3. Firestore 依「讀幾份文件」計費：一個月一份，十年也才 120 份，比每筆一份便宜很多。
//
// 其他設定（分類、收入、備註…）還是放在 ledgers/{uid} 那份主文件，不在這裡處理。

import {
  collection, doc, writeBatch, deleteField, FieldPath, getDocsFromServer,
} from "firebase/firestore";

export const MONTH_ID_RE = /^\d{4}-\d{2}$/;
const BATCH_LIMIT = 400; // Firestore 一次批次最多 500 個動作，留一點空間

export const monthsCol = (db, uid) => collection(db, "ledgers", uid, "months");
export const monthRef = (db, uid, month) => doc(db, "ledgers", uid, "months", month);
export const monthOf = (expense) => String(expense.date || "").slice(0, 7);

// 把 months 集合的快照整理成一份支出清單（日期、編號排序，編號是時間為基礎，所以同一天維持記帳先後）
export function flattenMonthDocs(docs) {
  const out = [];
  docs.forEach((d) => {
    if (!MONTH_ID_RE.test(d.id)) return; // 備份用的文件（_backup_…）不是月份，略過
    const items = (d.data && d.data.items) || {};
    Object.keys(items).forEach((id) => {
      const e = items[id];
      if (e && typeof e === "object") out.push({ ...e, id: e.id || id });
    });
  });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

// 新舊清單比較，找出要新增／修改的，和要刪掉的
export function diffExpenses(prev, next) {
  const before = new Map(prev.map((e) => [e.id, e]));
  const after = new Map(next.map((e) => [e.id, e]));
  const upserts = [];
  const removes = [];
  next.forEach((e) => {
    const o = before.get(e.id);
    if (!o || JSON.stringify(o) !== JSON.stringify(e)) upserts.push(e);
  });
  prev.forEach((o) => { if (!after.has(o.id)) removes.push(o); });
  return { upserts, removes };
}

// 把差異變成一串「寫入動作」：每個動作只動一份月文件裡的一格
export function buildOps(prev, next) {
  const { upserts, removes } = diffExpenses(prev, next);
  const before = new Map(prev.map((e) => [e.id, e]));
  const ops = [];
  removes.forEach((o) => ops.push({ type: "remove", month: monthOf(o), id: o.id }));
  upserts.forEach((e) => {
    const o = before.get(e.id);
    if (o && monthOf(o) !== monthOf(e)) ops.push({ type: "remove", month: monthOf(o), id: o.id }); // 改了日期、換月份：舊月份那格拿掉
    ops.push({ type: "upsert", month: monthOf(e), expense: e });
  });
  return ops;
}

// 實際寫進 Firestore。離線時 Firestore 會先排隊，連上網路後自動送出
export async function writeOps(db, uid, ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_LIMIT).forEach((op) => {
      const ref = monthRef(db, uid, op.month);
      if (op.type === "remove") {
        batch.set(ref, { items: { [op.id]: deleteField() } }, { merge: true });
      } else {
        // mergeFields：只整格取代這一筆，不碰同一個月的其他筆
        batch.set(ref, { items: { [op.expense.id]: op.expense } }, { mergeFields: [new FieldPath("items", op.expense.id)] });
      }
    });
    await batch.commit();
  }
}

// ---------- 舊資料搬家：以前放在主文件 expenses 陣列裡的支出 ----------
// 步驟：① 先把整份舊資料原樣備份成 months/_backup_legacy_<時間> → ② 把「月文件裡還沒有的」搬過去
// → ③ 從伺服器重讀，確認每一筆都在 → ④ 才把主文件的 expenses 欄位刪掉。
// 任何一步失敗就停下，不會刪東西。回傳搬了幾筆。
export async function migrateLegacyExpenses(db, uid, legacy, setDocFn, updateDocFn, mainRef) {
  const stamp = Date.now();
  await setDocFn(monthRef(db, uid, `_backup_legacy_${stamp}`), { legacyExpenses: legacy, savedAt: stamp });

  const serverSnap = await getDocsFromServer(monthsCol(db, uid));
  const existing = flattenMonthDocs(serverSnap.docs.map((d) => ({ id: d.id, data: d.data() })));
  const have = new Set(existing.map((e) => e.id));
  const missing = legacy.filter((e) => e && e.id && e.date && !have.has(e.id));
  await writeOps(db, uid, missing.map((e) => ({ type: "upsert", month: monthOf(e), expense: e })));

  const verifySnap = await getDocsFromServer(monthsCol(db, uid));
  const now = new Set(flattenMonthDocs(verifySnap.docs.map((d) => ({ id: d.id, data: d.data() }))).map((e) => e.id));
  const lost = legacy.filter((e) => e && e.id && e.date && !now.has(e.id));
  if (lost.length) throw new Error(`搬家後核對少了 ${lost.length} 筆，已停止，原資料沒有動`);

  await updateDocFn(mainRef, { expenses: deleteField(), expensesMovedAt: stamp });
  return missing.length;
}
