// 帳單證明匯入：目前只讀「中華電信電子發票開立通知」（信件附件的 .htm 檔，Big5 編碼）
//
// 只負責「讀」：把檔案讀成日期、金額、發票號碼等欄位，不碰任何資料。
// 寫進帳本是確認畫面（SettingsModal）的事。
// 不依賴瀏覽器的 DOM，所以網頁和 Node 測試都能用同一份。

const CHT_NAME = "中華電信";

// 設定畫面「目前認得」那行字；之後新增別家帳單證明，就加在這裡
export const INVOICE_SUPPORTED = "中華電信電子發票（信件附件的 .htm 檔）";

// 檔案多半是 Big5；先用 Big5 讀，認不出中華電信再試 UTF-8
export function decodeInvoiceBytes(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let text = new TextDecoder("big5").decode(bytes);
  if (!text.includes(CHT_NAME)) {
    const utf = new TextDecoder("utf-8").decode(bytes);
    if (utf.includes(CHT_NAME)) text = utf;
  }
  return text;
}

// HTML → 一行一格的文字（去掉標籤、樣式，空白行丟掉）
function htmlToLines(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .split(/\n/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const isNum = (s) => /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/.test(s);
const toNum = (s) => Number(String(s).replace(/,/g, ""));

// 「總計：」「隨機碼：」這種標籤，值可能在同一行，也可能在下一行
function valueAfter(lines, label, from = 0) {
  for (let i = from; i < lines.length; i++) {
    const m = lines[i].match(new RegExp("^" + label + "[：:]\\s*(.*)$"));
    if (m) return { value: m[1] || lines[i + 1] || "", index: i };
  }
  return null;
}

// 回傳 { ok, error?, ... }；ok 為 false 時不要寫進帳本
export function parseChtInvoice(buf) {
  let text;
  try { text = decodeInvoiceBytes(buf); } catch (e) { return { ok: false, error: "檔案讀不出來" }; }
  const lines = htmlToLines(text);
  const joined = lines.join("");
  if (!joined.includes(CHT_NAME) || !joined.includes("電子發票")) {
    return { ok: false, error: "認不出這份帳單證明。目前只認得：" + INVOICE_SUPPORTED };
  }

  const invoiceLine = lines.find((l) => /^[A-Z]{2}-?\d{8}$/.test(l));
  const dateLine = lines.find((l) => /^\d{4}-\d{2}-\d{2}$/.test(l));
  if (!invoiceLine || !dateLine) return { ok: false, error: "找不到發票號碼或開立日期" };
  const invoiceNo = invoiceLine.replace("-", "");

  const rc = valueAfter(lines, "隨機碼");
  const randomCode = rc ? String(rc.value).match(/\d{4}/)?.[0] || "" : "";

  // 品項：「品名／數量／單價／金額」標題之後，到「銷售額合計」之前
  const head = lines.findIndex((l) => l === "品名");
  const end = lines.findIndex((l) => /^銷售額合計/.test(l));
  const items = [];
  if (head >= 0 && end > head) {
    let name = "";
    let nums = [];
    for (let i = head + 1; i < end; i++) {
      const l = lines[i];
      if (["數量", "單價", "金額"].includes(l)) continue;
      if (isNum(l)) {
        nums.push(toNum(l));
        if (nums.length === 3) {
          items.push({ name: name.replace(/^[（(]|[）)]$/g, "").trim(), qty: nums[0], unit: nums[1], amount: nums[2] });
          nums = [];
          name = "";
        }
      } else {
        name = l;
      }
    }
  }
  if (!items.length) return { ok: false, error: "讀不到品項" };

  // 總計：用最後一個「總計：」（上方那個在表頭，下方那個是合計；兩個應該一樣）
  let total = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^總計[：:]\s*(.*)$/);
    if (m) {
      const v = (m[1] || lines[i + 1] || "").replace(/,/g, "");
      if (isNum(v)) total = toNum(v);
    }
  }
  if (total === null) return { ok: false, error: "找不到總計金額" };

  const sum = items.reduce((s, it) => s + it.amount, 0);
  const warnings = [];
  if (Math.abs(sum - total) > 0.5) warnings.push(`品項加起來 ${sum} 元，和總計 ${total} 元不一樣，請自己核對`);

  const remark = lines.slice(lines.findIndex((l) => /^備註[：:]/.test(l)));
  const remarkText = remark.slice(0, 4).join(" ");
  const phoneMasked = (remarkText.match(/用戶號碼\s*([0-9*]{6,})/) || [])[1] || "";
  const bm = remarkText.match(/\[?(\d{2,3})年(\d{1,2})月/);
  const billMonthLabel = bm ? `${bm[1]}年${Number(bm[2])}月帳` : "";

  return {
    ok: true,
    invoiceNo,
    date: dateLine,
    randomCode,
    total,
    items,
    itemName: items.length === 1 ? items[0].name : items.map((i) => i.name).join("、"),
    phoneMasked,
    billMonthLabel,
    warnings,
  };
}

// 遮蔽號碼（0988*1*9*9）和完整號碼（0988123959）對不對得上：長度一樣，每個數字位置都一樣
export function maskMatches(masked, full) {
  const m = String(masked || "");
  const f = String(full || "").trim();
  if (!m || m.length !== f.length || !/^\d+$/.test(f)) return false;
  for (let i = 0; i < m.length; i++) if (m[i] !== "*" && m[i] !== f[i]) return false;
  return true;
}

// 項目名稱：電話費＋號碼（有完整號碼用完整號碼，沒有就用發票上遮蔽的寫法）
export function invoiceItemName(parsed, fullPhone) {
  const num = fullPhone || parsed.phoneMasked || "";
  return "電話費" + num;
}
