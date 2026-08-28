export const DEFAULT_CATEGORIES = [
  { id: "食", name: "飲食", color: "#C1622D" },
  { id: "衣", name: "服飾", color: "#B4637A" },
  { id: "共同基金", name: "基金", color: "#2F6F62" },
  { id: "行", name: "交通", color: "#4A6FA5" },
  { id: "居家", name: "居家", color: "#A97C50" },
  { id: "媽媽", name: "媽媽", color: "#7B5E7B" },
  { id: "卡費", name: "卡費", color: "#5B5B5B" },
  { id: "保險", name: "保險", color: "#4B5A85" },
  { id: "育", name: "教育", color: "#3F7D5C" },
  { id: "樂", name: "娛樂", color: "#C79A2A" },
  { id: "其他", name: "其他", color: "#8C8474" },
  { id: "公益", name: "公益", color: "#A3352A" },
];

// Income sources are { id, name }. `id` is what actually gets stored on each
// income record (source: id) and MUST stay stable — the tutoring app syncs
// income directly into Firestore using the id "華語文教學", so that id can
// never change even if the user renames the display label in Settings.
export const DEFAULT_INCOME_SOURCES = [
  { id: "華語文教學", name: "華語文教學" },
  { id: "股票投資", name: "股票投資" },
  { id: "交割折讓", name: "交割折讓" },
];
export const SYNCED_INCOME_SOURCE_ID = "華語文教學";

// Column labels used by the *legacy* Excel importer only. Kept separate from
// DEFAULT_INCOME_SOURCES so that renaming/adding income sources in Settings
// never affects how the old spreadsheet format is parsed.
export const LEGACY_INCOME_LABELS = ["華語文教學", "股票投資", "交割折讓"];

export const DEFAULT_APP_NAME = "生活帳本";

export const INK = "#2B2620";
export const PAPER = "#F6F1E6";
export const PAPER_DEEP = "#EDE4D0";
export const STAMP = "#A3352A";
export const GOOD = "#3F7D5C";

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const monthKeyOf = (iso) => iso.slice(0, 7);
export const twYear = (yyyy) => Number(yyyy) - 1911;
export const fmt = (n) => Math.round(n || 0).toLocaleString("zh-Hant-TW");
export const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function dateLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))} (${WEEKDAYS[d.getDay()]})`;
}

export function monthLabel(mk) {
  const [y, m] = mk.split("-");
  return { tw: `民國 ${twYear(y)} 年 ${Number(m)} 月`, greg: `${y} · ${Number(m)}月` };
}

export function shiftMonth(mk, delta) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function catMapOf(categories) {
  return Object.fromEntries(categories.map((c) => [c.id, c]));
}

export function computeMonthStats(expenses, incomes, categories, month, incomeSources = DEFAULT_INCOME_SOURCES) {
  const monthExp = expenses.filter((e) => monthKeyOf(e.date) === month);
  const categoryTotals = Object.fromEntries(categories.map((c) => [c.id, 0]));
  let total = 0;
  monthExp.forEach((e) => {
    if (!(e.category in categoryTotals)) categoryTotals[e.category] = 0;
    categoryTotals[e.category] += Number(e.price || 0);
    total += Number(e.price || 0);
  });
  const cardFee = categoryTotals["卡費"] || 0;
  const netExpense = total - cardFee;
  const incomeTotal = incomeSources.reduce(
    (s, src) => s + (incomes.find((i) => i.month === month && i.source === src.id)?.amount || 0),
    0
  );
  const balance = incomeTotal - netExpense;
  return { categoryTotals, total, cardFee, netExpense, incomeTotal, balance };
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const DEFAULT_STATS_PASSWORD_HASH_PROMISE = sha256Hex("0000");
