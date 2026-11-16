// 水電使用紀錄：一筆 = 某個表、某一期的使用度數。存在主文件的 utilityReadings 陣列。
// 欄位：{ id, kind:"water"|"electric", meterNo, periodStart, periodEnd, usage, unit, dailyAvg, docNo, source:"bill"|"ref", amount }
//   source "bill" = 這一期自己的帳單；"ref" = 別期帳單上的「上期、去年同期」參考值（日期是推算的）

export const KIND_LABEL = { water: "水", electric: "電" };

const pad = (n) => String(n).padStart(2, "0");
export function isoDate(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
export function rocToIso(roc, m, d) { return isoDate(Number(roc) + 1911, Number(m), Number(d)); }

// 日期往前或往後推幾個月（日數超過當月最後一天就取最後一天）
export function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(t / 12), nm = (t % 12) + 1;
  const last = new Date(ny, nm, 0).getDate();
  return isoDate(ny, nm, Math.min(d, last));
}
export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1; // 含頭含尾
}

export const readingKey = (r) => `${r.kind}|${r.meterNo || ""}|${r.periodStart}`;

// 帳單備註：115年6～7月帳，用水 22 度
export function periodNote(periodStart, periodEnd, usage, kind) {
  const [sy, sm] = periodStart.split("-").map(Number);
  const [ey, em, ed] = periodEnd.split("-").map(Number);
  const endEff = ed <= 10 ? em - 1 || 12 : em; // 結束日在月初（例如 8/3），算到前一個月
  const roc = sy - 1911;
  const range = endEff === sm || (ey === sy && endEff < sm) ? `${sm}月帳` : `${sm}～${endEff}月帳`;
  return `${roc}年${range}，${kind === "electric" ? "用電" : "用水"} ${usage} 度`;
}

// 一份帳單 → 三筆紀錄（本期、上期、去年同期）。parsed 要有 kind, meterNo, periodStart, periodEnd, usage, dailyAvg, usagePrev, dailyAvgPrev, usageLastYear, dailyAvgLastYear, docNo, amount
export function buildReadings(parsed, genId) {
  const base = { kind: parsed.kind, meterNo: parsed.meterNo || "", unit: "度" };
  const out = [{
    ...base, id: genId(), periodStart: parsed.periodStart, periodEnd: parsed.periodEnd,
    usage: parsed.usage, dailyAvg: parsed.dailyAvg ?? null, docNo: parsed.docNo || "", source: "bill", amount: parsed.amount ?? null,
  }];
  if (Number.isFinite(parsed.usagePrev)) {
    out.push({
      ...base, id: genId(), periodStart: addMonths(parsed.periodStart, -2), periodEnd: addMonths(parsed.periodEnd, -2),
      usage: parsed.usagePrev, dailyAvg: parsed.dailyAvgPrev ?? null, docNo: "", source: "ref", amount: null,
    });
  }
  if (Number.isFinite(parsed.usageLastYear)) {
    out.push({
      ...base, id: genId(), periodStart: addMonths(parsed.periodStart, -12), periodEnd: addMonths(parsed.periodEnd, -12),
      usage: parsed.usageLastYear, dailyAvg: parsed.dailyAvgLastYear ?? null, docNo: "", source: "ref", amount: null,
    });
  }
  return out;
}

// 合併進現有清單：同一個表、同一期只留一筆；真正的帳單（bill）會取代參考值（ref），參考值不會蓋掉真正的帳單
export function mergeReadings(list, incoming) {
  const cur = Array.isArray(list) ? [...list] : [];
  incoming.forEach((rec) => {
    const i = cur.findIndex((r) => readingKey(r) === readingKey(rec));
    if (i < 0) { cur.push(rec); return; }
    if (cur[i].source === "bill" && rec.source === "ref") return;
    cur[i] = { ...rec, id: cur[i].id };
  });
  return cur;
}
export function removeReading(list, id) {
  return (Array.isArray(list) ? list : []).filter((r) => r && r.id !== id);
}
export function sortedReadings(list, kind) {
  return (Array.isArray(list) ? list : []).filter((r) => r && r.kind === kind)
    .sort((a, b) => (a.periodStart < b.periodStart ? -1 : a.periodStart > b.periodStart ? 1 : 0));
}

// 圖上的標籤：115年6～7月
export function shortLabel(periodStart, periodEnd) {
  const [sy, sm] = periodStart.split("-").map(Number);
  const [, em, ed] = periodEnd.split("-").map(Number);
  const endEff = ed <= 10 ? em - 1 || 12 : em;
  const roc = sy - 1911;
  return endEff === sm ? `${roc}年${sm}月` : `${roc}年${sm}～${endEff}月`;
}
