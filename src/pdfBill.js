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
    const rows = [];
    tc.items.forEach((it) => {
      if (!it.str || !it.str.trim()) return;
      const y = it.transform[5], h = it.height || 8;
      let row = rows.find((r) => Math.abs(r.y - y) < Math.max(2, h * 0.35));
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x: it.transform[4], s: it.str });
    });
    rows.sort((a, b) => b.y - a.y);
    rows.forEach((r) => {
      r.items.sort((a, b) => a.x - b.x);
      lines.push(r.items.map((i) => i.s).join(" "));
    });
  }
  return lines.join("\n");
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

  // 本期應繳
  let amount = null;
  const am = flat.match(/本期應繳(?:金額|總額)?[^0-9\-]{0,12}\$?\s*(-?[\d,]+)/) || flat.match(/應繳(?:金額|總額)[^0-9\-]{0,12}\$?\s*(-?[\d,]+)/);
  if (am) amount = toInt(am[1]);
  if (amount === null || !Number.isFinite(amount)) return { ok: false, error: "找不到本期應繳金額" };

  const noPayNeeded = /暫無需繳款|無需繳款|併入次期/.test(flat);

  const warnings = [];
  // 前期應繳 − 繳款 + 本期新增 = 本期應繳，對不起來就提醒
  const prev = flat.match(/前期應繳[^0-9\-]{0,8}(-?[\d,]+)/);
  const paid = flat.match(/(?:前期)?繳款[^0-9\-]{0,8}(-?[\d,]+)/);
  const add = flat.match(/本期新增[^0-9\-]{0,8}(-?[\d,]+)/);
  if (prev && paid && add) {
    const calc = toInt(prev[1]) - Math.abs(toInt(paid[1])) + toInt(add[1]);
    if (calc !== amount) warnings.push(`帳單上的前期、繳款、新增算出來是 ${calc} 元，和本期應繳 ${amount} 元不一樣，請自己核對`);
  }
  if (!phoneMasked) warnings.push("沒讀到電話號碼，項目名稱請自己確認");
  if (!periodEnd) warnings.push("沒讀到列帳期間，帳單月份請自己填");

  return { ok: true, billNo, phoneMasked, periodEnd, billMonthLabel, amount, noPayNeeded, warnings };
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
