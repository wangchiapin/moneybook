// 📬 自動收到的帳單：收件機器人（moneybook-stmt-bot）每天把信箱裡「帳單」標籤的附件放進 Firestore 的
// billInbox/{uid}/items，這裡負責把它們讀成確認卡。機器人只負責「拿」和「解鎖 PDF 取出文字」，
// 讀成日期、金額、度數都在這個網頁裡做（讀取規則只有一份）。
//
// 一筆收件匣文件：
//   { createdAt, mailDate, mailSubject, fileName, status: "ok" | "needpw" | "error", error?,
//     type: "pdf" | "htm", text?（pdf 解出的文字，一行一列）, htmBase64?（htm 原始檔） }
import { parseTwWaterText } from "./waterBill.js";
import { parseTaipowerText } from "./taipowerBill.js";
import { parseTwmBillText } from "./pdfBill.js";

export function b64ToArrayBuffer(b64) {
  const bin = atob(String(b64 || ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// 看一份 PDF 文字是哪種帳單：water / electric / twm（台灣大哥大，進待扣款）/ unknown
export function classifyBillText(text, today, fileName) {
  const water = parseTwWaterText(text);
  if (water.ok) return { kind: "water", water };
  const electric = parseTaipowerText(text);
  if (electric.ok) return { kind: "electric", electric };
  const twm = parseTwmBillText(text, today, fileName);
  if (twm.ok) return { kind: "twm", twm };
  const known = [water, electric].map((r) => r.error).find((m) => m && !/認不出/.test(m));
  return { kind: "unknown", error: known || "" };
}

// 收件匣清單由舊到新
export function sortInbox(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}
