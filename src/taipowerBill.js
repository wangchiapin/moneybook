// 台灣電力公司「電子帳單清單式電費繳費憑證」解析（扣款後的憑證，日期和金額是確定的）。
// 一張憑證可能有好幾戶（每個電號一列），每戶有自己的用電度數、金額、發票號碼。
// 注意：文字版 PDF 的排列順序我只看過圖片版，所以解析寫得寬鬆；讀不懂時畫面會秀出讀到的文字，方便調整。
import { rocToIso, daysBetween } from "./utilityReadings.js";

export const ELECTRIC_SUPPORTED = "台灣電力公司電費繳費憑證（PDF，扣款後）";
export const DEFAULT_ELECTRIC_ITEM = "電費";

const toNum = (s) => Number(String(s).replace(/[,，\s]/g, ""));
// 全形數字轉半形（地址常用全形：３０巷１８號）
const half = (s) => String(s || "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
const iso7 = (s) => rocToIso(s.slice(0, 3), s.slice(3, 5), s.slice(5, 7));

export function electricNote(periodStart, periodEnd, usage, label) {
  const [sy, sm, sd] = periodStart.split("-").map(Number);
  const [, em, ed] = periodEnd.split("-").map(Number);
  return `${sy - 1911}年${sm}/${sd}～${em}/${ed}，用電 ${usage} 度${label ? `（${label}）` : ""}`;
}

export function parseTaipowerText(text) {
  const flat = half(String(text || "")).replace(/　/g, " ").replace(/\s+/g, " ");
  // 標題常是「台 灣 電 力 公 司」（字與字之間有空白），所以比對時先把空白全拿掉
  const compact = flat.replace(/\s/g, "");
  if (!/台灣電力|TAIWANPOWER|電費繳費憑證/i.test(compact)) return { ok: false, error: "認不出這份帳單。" };
  if (!/電費繳費憑證/.test(compact)) return { ok: false, error: "這不是扣款後的「電費繳費憑證」。電費通知單是扣款前的，金額是預計的，請匯入扣款後的憑證。" };

  const receiptNo = (flat.match(/收據號碼\s*[:：]?\s*(E-?\d+)/) || [])[1] || "";

  // 每一戶一列：收費日(7碼) 電號(11碼) 代繳帳號 [統編…] 計費期間(7碼-7碼) 用電度數 [電費 營業稅] 應繳金額
  const starts = [...flat.matchAll(/(?<!\d)(\d{7})\s+(\d{11})\s/g)];
  if (!starts.length) return { ok: false, error: "找不到用電的資料列（電號）" };
  const accounts = [];
  const warnings = [];
  starts.forEach((m, i) => {
    const seg = flat.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : flat.length);
    const pm = seg.match(/(\d{7})\s*-\s*(\d{7})\s+(\d+)((?:\s+[\d,]+){0,3})/);
    if (!pm) { warnings.push(`電號 ${m[2]} 的計費期間或度數讀不到`); return; }
    const usage = Number(pm[3]);
    const tail = (pm[4] || "").trim().split(/\s+/).filter(Boolean).map(toNum);
    const inv = seg.match(/本期發票資訊.*?發票號碼\s*[:：]\s*([A-Z]{2}-?\d{8})\s*金額\s*\(元\)\s*[:：]\s*([\d,]+)/);
    const invoiceNo = inv ? inv[1].replace("-", "") : "";
    // 應繳金額：以「本期發票資訊」的金額為準（最不會被前面空白欄位搞混），讀不到才用資料列最後一個數字
    const amount = inv ? toNum(inv[2]) : (tail.length ? tail[tail.length - 1] : NaN);
    if (inv && tail.length && tail[tail.length - 1] !== amount) warnings.push(`電號 ${m[2]}：資料列的應繳金額 ${tail[tail.length - 1]} 和發票金額 ${amount} 不一樣，請自己核對`);
    const addr = (seg.match(/用電地址\s*[:：]\s*(\S+)/) || [])[1] || "";
    const floor = (addr.match(/([一二三四五六七八九十]+樓|\d+樓)\s*$/) || addr.match(/([一二三四五六七八九十]+樓|\d+樓)/) || [])[1] || "";
    const periodStart = iso7(pm[1]), periodEnd = iso7(pm[2]);
    if (!Number.isFinite(amount) || !(usage >= 0)) { warnings.push(`電號 ${m[2]} 的度數或金額讀不到`); return; }
    accounts.push({
      meterNo: m[2], label: floor || `電號${m[2].slice(-3)}`, usage, amount, invoiceNo,
      date: iso7(m[1]), periodStart, periodEnd,
      dailyAvg: Math.round((usage / daysBetween(periodStart, periodEnd)) * 100) / 100,
    });
  });
  if (!accounts.length) return { ok: false, error: "讀不到任何一戶的度數和金額" };

  const totals = [...flat.matchAll(/應繳金額\s*[:：]?\s*\$?\s*([\d,]+)\s*元/g)].map((m) => toNum(m[1]));
  const total = totals.length ? totals[totals.length - 1] : null;
  const sum = accounts.reduce((s, a) => s + a.amount, 0);
  if (total !== null && total !== sum) warnings.push(`各戶金額加起來 ${sum} 元，和憑證的應繳總金額 ${total} 元不一樣，請自己核對`);

  return { ok: true, kind: "electric", receiptNo, total: total ?? sum, accounts, warnings };
}
