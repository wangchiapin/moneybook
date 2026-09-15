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

export const todayISO = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${d}`;
};
export const monthKeyOf = (iso) => iso.slice(0, 7);
export const twYear = (yyyy) => Number(yyyy) - 1911;
export const fmt = (n) => Math.round(n || 0).toLocaleString("zh-Hant-TW");
export const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function dateLabel(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))} (${WEEKDAYS[d.getUTCDay()]})`;
}

export function monthLabel(mk) {
  const [y, m] = mk.split("-");
  return { tw: `民國 ${twYear(y)} 年 ${Number(m)} 月`, greg: `${y} · ${Number(m)}月` };
}

export function shiftMonth(mk, delta) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
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

// ---------- 隨手記 (quick jot) ----------

// Keyword → category-id lookup used to auto-guess a category from an item's
// text. Keyed by the DEFAULT_CATEGORIES ids; if the user has renamed/removed
// a default category, guessCategoryId() simply skips ids no longer present.
export const CATEGORY_KEYWORDS = {
  "食": ["早餐", "午餐", "晚餐", "消夜", "宵夜", "咖啡", "飲料", "便當", "小吃", "火鍋", "燒烤", "超商", "超市", "買菜", "食材", "外送", "飲食"],
  "衣": ["衣服", "鞋", "包包", "褲", "裙", "配件", "飾品"],
  "共同基金": ["基金", "共同基金", "提撥", "存款"],
  "行": ["加油", "停車", "計程車", "uber", "Uber", "公車", "捷運", "高鐵", "火車", "過路費", "機車", "保養", "燃料稅", "牌照稅"],
  "居家": ["房租", "水電", "瓦斯費", "電費", "水費", "網路費", "家具", "家電", "修繕", "日用品", "衛生紙"],
  "媽媽": ["媽媽", "母親", "孝親"],
  "卡費": ["卡費", "信用卡", "刷卡", "分期"],
  "保險": ["保險", "保費", "壽險", "醫療險", "車險"],
  "育": ["學費", "補習", "課程", "教育", "考試", "證照"],
  "樂": ["電影", "唱歌", "KTV", "ktv", "遊戲", "旅遊", "展覽", "演唱會", "訂閱", "netflix", "Netflix", "spotify", "Spotify"],
  "公益": ["捐款", "公益", "樂捐", "慈善"],
};

export function guessCategoryId(text, categories) {
  if (!text) return "";
  const catIds = new Set(categories.map((c) => c.id));
  for (const [id, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (!catIds.has(id)) continue;
    if (keywords.some((kw) => text.includes(kw))) return id;
  }
  return "";
}

// Date patterns a 隨手記 line may start with. Checked in order — more
// specific / longer patterns first so an 8-digit date is never mistaken for
// a leading 4-digit MMDD date.
const QUICK_NOTE_DATE_PATTERNS = [
  { re: /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/, kind: "ad" },
  { re: /^民國(\d{2,3})年?(\d{1,2})月(\d{1,2})日?/, kind: "roc" },
  { re: /^(\d{4})(\d{2})(\d{2})(?!\d)/, kind: "ad-compact" },
  { re: /^(\d{2})(\d{2})(?!\d)/, kind: "mmdd" },
];

function extractQuickNoteDate(line, todayIso) {
  for (const { re, kind } of QUICK_NOTE_DATE_PATTERNS) {
    const m = line.match(re);
    if (!m) continue;
    let y, mo, d;
    if (kind === "ad" || kind === "ad-compact") {
      y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]);
    } else if (kind === "roc") {
      y = Number(m[1]) + 1911; mo = Number(m[2]); d = Number(m[3]);
    } else {
      y = Number(todayIso.slice(0, 4)); mo = Number(m[1]); d = Number(m[2]);
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    return { iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, rest: line.slice(m[0].length).trim() };
  }
  return null;
}

// Splits the remainder of a line (after the date) into { item, price } pairs,
// e.g. "早餐 500 午餐300 晚餐600" → three pairs. A trailing item with no
// number after it still becomes a pair with price 0 (flagged incomplete
// later), rather than being dropped.
function extractQuickNotePairs(rest) {
  const pairs = [];
  const re = /([^\d]*?)(\d+(?:\.\d+)?)/g;
  let m;
  let lastIndex = 0;
  while ((m = re.exec(rest)) !== null) {
    const item = m[1].trim();
    const price = Number(m[2]);
    pairs.push({ item, price });
    lastIndex = re.lastIndex;
  }
  const trailing = rest.slice(lastIndex).trim();
  if (trailing) pairs.push({ item: trailing, price: 0 });
  if (pairs.length === 0 && rest.trim()) pairs.push({ item: rest.trim(), price: 0 });
  return pairs;
}

// Parses free-text 隨手記 input into candidate expenses. Lines with no
// recognizable leading date go into `unresolved` untouched (left for the
// user to fix by hand) instead of being dropped or guessed at.
export function parseQuickNoteText(rawText, todayIso, categories) {
  const lines = (rawText || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const candidates = [];
  const unresolved = [];
  lines.forEach((line) => {
    const dateInfo = extractQuickNoteDate(line, todayIso);
    if (!dateInfo) { unresolved.push(line); return; }
    const pairs = extractQuickNotePairs(dateInfo.rest);
    if (pairs.length === 0) {
      candidates.push({ tempId: genId(), date: dateInfo.iso, category: "", item: "", price: 0 });
      return;
    }
    pairs.forEach((p) => {
      candidates.push({
        tempId: genId(),
        date: dateInfo.iso,
        category: guessCategoryId(p.item, categories),
        item: p.item,
        price: p.price,
      });
    });
  });
  return { candidates, unresolved };
}
