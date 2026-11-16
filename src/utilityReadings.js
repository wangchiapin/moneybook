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
  const base = { kind: parsed.kind, meterNo: parsed.meterNo || "", label: parsed.label || "", unit: "度" };
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
// 依「種類＋表號」分組（一樓、二樓是不同的電號，要分開畫）；水在前、電在後
export function groupReadings(list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).filter(Boolean).forEach((r) => {
    const key = `${r.kind}|${r.meterNo || ""}`;
    if (!map.has(key)) map.set(key, { key, kind: r.kind, meterNo: r.meterNo || "", label: "", list: [] });
    const g = map.get(key);
    g.list.push(r);
    if (r.label && !g.label) g.label = r.label;
  });
  const groups = [...map.values()];
  groups.forEach((g) => g.list.sort((a, b) => (a.periodStart < b.periodStart ? -1 : a.periodStart > b.periodStart ? 1 : 0)));
  return groups.sort((a, b) => (a.kind === b.kind ? (a.label || a.meterNo).localeCompare(b.label || b.meterNo, "zh-Hant") : a.kind === "water" ? -1 : 1));
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

// 同期比較：每一期配上「去年同一期」（開始日差 3 天內都算同一期）。回傳由舊到新的列，只含找得到去年資料的期別
export function yoyRows(list) {
  const arr = (Array.isArray(list) ? list : []).filter(Boolean)
    .sort((a, b) => (a.periodStart < b.periodStart ? -1 : a.periodStart > b.periodStart ? 1 : 0));
  const rows = [];
  arr.forEach((r) => {
    const target = addMonths(r.periodStart, -12);
    let best = null, bestGap = 99;
    arr.forEach((p) => {
      if (p === r) return;
      const gap = Math.abs(Date.parse(p.periodStart) - Date.parse(target)) / 86400000;
      if (gap <= 3 && gap < bestGap) { best = p; bestGap = gap; }
    });
    if (best) rows.push({ name: shortLabel(r.periodStart, r.periodEnd), cur: r, prev: best, 今年: r.usage, 去年同期: best.usage });
  });
  return rows;
}
// 一句話結論：最近一期 22 度，去年同期 33 度，少 11 度（-33%）
export function yoySentence(row) {
  if (!row) return "";
  const diff = row.cur.usage - row.prev.usage;
  const head = `最近一期 ${row.cur.usage} 度，去年同期 ${row.prev.usage} 度`;
  if (diff === 0) return `${head}，一樣多`;
  const pct = row.prev.usage ? `（${diff > 0 ? "+" : "-"}${Math.round((Math.abs(diff) / row.prev.usage) * 100)}%）` : "";
  return `${head}，${diff > 0 ? "多" : "少"} ${Math.abs(diff)} 度${pct}`;
}
