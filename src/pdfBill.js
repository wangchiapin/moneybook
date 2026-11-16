// 讀「PDF 帳單」（目前：台灣大哥大電信帳單）。
// 這種帳單沒有付款證明，所以讀出來的是「待扣款」，要等你在信用卡 APP 看到真的扣了才記帳。
// 解析規則只看文字（parseTwmBillText），PDF 讀字的部分（readPdfText）另外放，方便測試。

export const PDF_BILL_SUPPORTED = "台灣大哥大電信帳單（PDF）";
const PDFJS_BASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/";
const PW_KEY = "MB_BILL_PDF_PASSWORDS_V1"; // 只存在這台裝置，不同步到雲端

// ---- 密碼：只存在這台裝置的瀏覽器 ----
export function getSavedPdfPasswords() {
  try { return JSON.parse(localStorage.getItem(PW_KEY) || "[]").filter(Boolean); } catch { return []; }
}
export function rememberPdfPassword(pw) {
  if (!pw) return;
  const list = getSavedPdfPasswords().filter((p) => p !== pw);
  list.unshift(pw);
  try { localStorage.setItem(PW_KEY, JSON.stringify(list.slice(0, 5))); } catch { /* 略過 */ }
}
export function forgetPdfPasswords() {
  try { localStorage.removeItem(PW_KEY); } catch { /* 略過 */ }
}

// ---- PDF.js（要用到才從 CDN 載入）----
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* @vite-ignore */ PDFJS_BASE + "pdf.min.mjs")
      .then((m) => { m.GlobalWorkerOptions.workerSrc = PDFJS_BASE + "pdf.worker.min.mjs"; return m; })
      .catch((e) => { pdfjsPromise = null; throw e; });
  }
  return pdfjsPromise;
}

// 讀出整份 PDF 的文字。需要密碼時丟出 { needPassword: true, wrongPassword }。
export async function readPdfText(arrayBuffer, password) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer.slice(0)),
    password: password || undefined,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
    cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/",
    cMapPacked: true,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    if (e && e.name === "PasswordException") {
      const err = new Error(e.code === 2 ? "密碼不正確" : "這份帳單需要密碼");
      err.needPassword = true;
      err.wrongPassword = e.code === 2;
      throw err;
    }
    throw e;
  }
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    lines.push(...textItemsToLines(tc.items));
  }
  return lines.join("\n");
}

// PDF.js 讀出來的文字塊 → 一行一行（同一高度的合成一行、由左到右）。獨立出來方便用真實 PDF 測試。
export function textItemsToLines(items) {
  const rows = [];
  items.forEach((it) => {
    if (!it.str || !it.str.trim()) return;
    const y = it.transform[5], h = it.height || 8;
    let row = rows.find((r) => Math.abs(r.y - y) < Math.max(2, h * 0.35));
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x: it.transform[4], s: it.str });
  });
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    return r.items.map((i) => i.s).join(" ");
  });
}

const toInt = (s) => Number(String(s).replace(/[,，\s]/g, ""));

// 民國年 → 民國年（已經是民國就原樣），西元年（>=1911）轉民國
const rocYear = (y) => (y >= 1911 ? y - 1911 : y);

/**
 * 解析台灣大哥大帳單文字。成功回 { ok:true, billNo, phoneMasked, periodEnd, billMonthLabel,
 * amount, noPayNeeded, warnings }，不是這種帳單回 { ok:false, error }。
 * today：測試時可以指定「今天」（YYYY-MM-DD）。
 */
export function parseTwmBillText(text, today, fileName) {
  const t = String(text || "").replace(/　/g, " ");
  const flat = t.replace(/\s+/g, " ");
  if (!/台灣大哥大|台灣大|Taiwan Mobile|twm/i.test(flat) && !/帳單編號\s*[:：]?\s*A\d{6,}/.test(flat) && !/帳單/.test(flat) && !/A\d{11,13}/.test(String(fileName || ""))) {
    return { ok: false, error: "認不出這份帳單。目前只認得：" + PDF_BILL_SUPPORTED };
  }

  // 帳單編號：先找「帳單編號」後面，找不到就找整份文字裡長得像 A116398010268 的號碼，最後才用檔名
  const billNo = (flat.match(/帳單編號\s*[:：]?\s*([A-Z]\d{8,})/) || [])[1]
    || (flat.match(/\b([A-Z]\d{11,13})\b/) || [])[1]
    || (String(fileName || "").match(/([A-Z]\d{11,13})/) || [])[1] || "";
  if (!billNo) return { ok: false, error: "找不到帳單編號，這份可能不是台灣大哥大的帳單" };

  const phoneMasked = (flat.match(/\b(09[0-9*]{8,10})\b/) || [])[1] || "";

  // 列帳期間 例：10/04–11/03 或 115/10/04～115/11/03
  const pm = flat.match(/列帳期間[^0-9]{0,6}((?:\d{2,4}\s*[\/年.]\s*)?\d{1,2})\s*[\/月.]\s*(\d{1,2})\s*[日]?\s*[-–—~～至到－]+\s*((?:\d{2,4}\s*[\/年.]\s*)?\d{1,2})\s*[\/月.]\s*(\d{1,2})/);
  let periodEnd = "", billMonthLabel = "";
  if (pm) {
    const endA = pm[3].replace(/\s/g, "");
    const parts = endA.split(/[\/年.]/).filter(Boolean);
    const endMonth = Number(parts[parts.length - 1]);
    const endDay = Number(pm[4]);
    let year;
    if (parts.length >= 2) year = rocYear(Number(parts[0]));
    else {
      const now = today ? new Date(today) : new Date();
      let y = now.getFullYear();
      if (endMonth > now.getMonth() + 1 + 1) y -= 1; // 帳單月份比現在晚太多，應該是去年
      year = y - 1911;
    }
    periodEnd = `${year}/${String(endMonth).padStart(2, "0")}/${String(endDay).padStart(2, "0")}`;
    billMonthLabel = `${year}年${endMonth}月帳單`;
  }

  // 本期應繳：帳單上方那一列「前期應繳 − 繳款金額 + 本期新增 = 本期應繳」，例如 601 0 599 1,200。
  // 先找「連續四個數字、前面算式剛好成立」的那一列（最準，不會被說明文字裡的「1,000 元」騙到），
  // 找不到再看「應繳總額$」，最後才看「本期應繳」後面緊接的數字。
  let amount = null, prevAmt = null, paidAmt = 0;
  // 只從「本期應繳」這個標題之後找（頁首的「頁次 1 / 1」「-1 / 1」也會湊出算式成立的數字，要避開）
  const headAt = Math.max(flat.indexOf("本期應繳"), flat.indexOf("帳單類別"));
  const region = headAt >= 0 ? flat.slice(headAt) : flat;
  const nums = [...region.matchAll(/(?<![\d,.\/-])(\d{1,3}(?:,\d{3})+|\d+)(?![\d,\/]|\.\d)/g)].map((m) => toInt(m[1]));
  for (let i = 0; i + 3 < nums.length; i++) {
    const [n1, n2, n3, n4] = nums.slice(i, i + 4);
    if (n4 >= 10 && n1 - n2 + n3 === n4) { amount = n4; prevAmt = n1; paidAmt = n2; break; }
  }
  if (amount === null) {
    const m = flat.match(/應繳總額\s*\$?\s*([\d,]+)/) || flat.match(/本期應繳\s*[:：$]?\s*(-?[\d,]+)(?!\s*[元筆])/);
    if (m) amount = toInt(m[1]);
  }
  if (amount === null || !Number.isFinite(amount)) return { ok: false, error: "找不到本期應繳金額" };

  const dueDate = (flat.match(/(\d{2,3}\/\d{1,2}\/\d{1,2})\s*(?:自行繳款|轉帳代繳|信用卡)/) || flat.match(/繳款截止日\s*[:：]?\s*(\d{2,3}\/\d{1,2}\/\d{1,2})/) || [])[1] || "";
  const payMethod = (flat.match(/(自行繳款|轉帳代繳|信用卡自動扣款)/) || [])[1] || "";

  const noPayNeeded = /暫無需繳款|無需繳款|併入次期/.test(flat);

  const warnings = [];
  if (prevAmt !== null && prevAmt - paidAmt > 0) warnings.push(`前期還有 ${prevAmt - paidAmt} 元沒繳，這期的 ${amount} 元是前期加本期合計`);
  if (!phoneMasked) warnings.push("沒讀到電話號碼，項目名稱請自己確認");
  if (!periodEnd) warnings.push("沒讀到列帳期間，帳單月份請自己填");

  return { ok: true, billNo, phoneMasked, periodEnd, billMonthLabel, amount, noPayNeeded, dueDate, payMethod, warnings };
}

// 待扣款清單（存在主文件 pendingBills）：加入、刪除、擋重複
export function addPendingBill(list, bill) {
  const cur = Array.isArray(list) ? list : [];
  if (cur.some((b) => b && b.billNo === bill.billNo)) return cur;
  return [...cur, bill];
}
export function removePendingBill(list, id) {
  return (Array.isArray(list) ? list : []).filter((b) => b && b.id !== id);
}
