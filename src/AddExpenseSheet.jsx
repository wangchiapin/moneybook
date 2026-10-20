import React, { useMemo, useRef, useState } from "react";
import { X, Camera, Loader2 } from "lucide-react";
import { PAPER, STAMP, GOOD, todayISO, monthKeyOf, parsePriceInput, fmt } from "./lib.js";
import { CatDot, fieldLabel, inputStyle } from "./components.jsx";
import { callGeminiVision, parseJsonLoose } from "./gemini.js";

// 從過去的支出統計「常用項目」與「常用金額」：次數多的在前，次數一樣就最近用過的在前
function bump(map, key, date) {
  const s = map.get(key) || { n: 0, last: "" };
  s.n += 1;
  if (date > s.last) s.last = date;
  map.set(key, s);
}
function rank(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1].n - a[1].n || (a[1].last < b[1].last ? 1 : -1))
    .slice(0, limit);
}
function buildSuggestStats(expenses) {
  const items = new Map();      // 項目名稱 -> { n, last, cats, prices }
  const catPrices = new Map();  // 分類 -> 金額統計
  for (const e of expenses) {
    const date = e.date || "";
    const price = Number(e.price);
    const name = (e.item || "").trim();
    if (name) {
      let it = items.get(name);
      if (!it) { it = { n: 0, last: "", cats: new Map(), prices: new Map() }; items.set(name, it); }
      it.n += 1;
      if (date > it.last) it.last = date;
      if (e.category) bump(it.cats, e.category, date);
      if (price > 0 && isFinite(price)) bump(it.prices, price, date);
    }
    if (e.category && price > 0 && isFinite(price)) {
      if (!catPrices.has(e.category)) catPrices.set(e.category, new Map());
      bump(catPrices.get(e.category), price, date);
    }
  }
  const itemMap = new Map();
  for (const [name, it] of items) {
    const topCat = rank(it.cats, 1)[0];
    itemMap.set(name, {
      name, n: it.n, last: it.last,
      cat: topCat ? topCat[0] : "",
      topPrices: rank(it.prices, 5).map(([p]) => p),
    });
  }
  const list = [...itemMap.values()].sort((a, b) => b.n - a.n || (a.last < b.last ? 1 : -1));
  const catTop = new Map();
  for (const [cat, m] of catPrices) catTop.set(cat, rank(m, 6).map(([p]) => p));
  return { list, itemMap, catTop };
}

const chipStyle = {
  border: "1px solid #E0D5BC", background: "#fff", color: "#5C5343", borderRadius: 999,
  padding: "5px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  display: "flex", alignItems: "center", gap: 5,
};

export default function AddExpenseSheet({ viewMonth, categories, expenses, initialEntry, aiSettings, onClose, onSubmit }) {
  const isEdit = !!initialEntry;
  const [date, setDate] = useState(() => {
    if (initialEntry) return initialEntry.date;
    const t = todayISO();
    return monthKeyOf(t) === viewMonth ? t : `${viewMonth}-01`;
  });
  const [category, setCategory] = useState(initialEntry?.category || categories[0]?.id || "");
  const [item, setItem] = useState(initialEntry?.item || "");
  const [price, setPrice] = useState(initialEntry ? String(initialEntry.price) : "");
  const [note, setNote] = useState(initialEntry?.note || "");
  const [calcMode, setCalcMode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanNotice, setScanNotice] = useState("");
  const fileRef = useRef(null);
  const priceRef = useRef(null);

  // 常用項目／金額提示：只在「新增」時出現，點到欄位才顯示
  const [focusField, setFocusField] = useState(null); // "item" | "price" | null
  const hideTimer = useRef(null);
  const showField = (f) => { clearTimeout(hideTimer.current); setFocusField(f); };
  // 稍微延遲才收起，點提示標籤時才不會因為欄位失焦而點不到
  const hideField = () => { hideTimer.current = setTimeout(() => setFocusField(null), 180); };
  const stats = useMemo(() => (isEdit ? null : buildSuggestStats(expenses || [])), [expenses, isEdit]);

  const hasKey = !!(aiSettings?.apiKey && aiSettings.apiKey.trim());

  const priceParsed = parsePriceInput(price);
  const canSubmit = !!category && priceParsed.ok;
  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ date, category, item: item.trim(), price: priceParsed.value, note: note.trim() }, initialEntry?.id);
  };
  // 離開金額欄時，若是算式就直接換成算出來的數字
  const commitPrice = () => {
    if (priceParsed.ok && priceParsed.isExpr) setPrice(String(priceParsed.value));
    setCalcMode(false);
    hideField();
  };

  const itemQuery = item.trim().toLowerCase();
  const itemSuggestions = stats && focusField === "item"
    ? stats.list.filter((s) => s.name !== item.trim() && (!itemQuery || s.name.toLowerCase().includes(itemQuery))).slice(0, 8)
    : [];
  const matchedItem = stats ? stats.itemMap.get(item.trim()) : null;
  const priceSuggestions = stats && focusField === "price" && !calcMode
    ? (matchedItem && matchedItem.topPrices.length ? matchedItem.topPrices : stats.catTop.get(category) || [])
    : [];

  // 點項目：填入項目、自動切到它最常用的分類，接著跳到金額欄
  const pickItem = (s) => {
    setItem(s.name);
    if (s.cat && categories.some((c) => c.id === s.cat)) setCategory(s.cat);
    if (priceRef.current) priceRef.current.focus();
  };
  // 點金額：填入金額並收起鍵盤
  const pickPrice = (p) => {
    setPrice(String(p));
    if (priceRef.current) priceRef.current.blur();
  };

  const handleScan = async (file) => {
    setScanning(true);
    setScanError("");
    setScanNotice("");
    try {
      const base64 = await fileToBase64(file);
      const catList = categories.map((c) => `${c.id}`).join("、");
      const prompt = `這是一張收據或發票的照片。請幫我讀出以下資訊，只回傳一個 JSON 物件，不要有其他文字或 markdown 符號：
{
  "date": "YYYY-MM-DD，收據上的交易日期，看不出來就填 null",
  "item": "商店名稱或最能代表這筆消費的品項名稱，簡短",
  "price": 總金額的數字，不要有貨幣符號或逗號,
  "category": "從這些分類中選一個最符合的：${catList}，選不出來就填 \"其他\"",
  "note": "簡短備註，例如品項細節，沒有就填空字串"
}`;
      const text = await callGeminiVision(aiSettings.apiKey, aiSettings.model, prompt, { base64, mimeType: file.type || "image/jpeg" });
      const parsed = parseJsonLoose(text);

      if (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) setDate(parsed.date);
      if (parsed.item) setItem(String(parsed.item).trim());
      if (parsed.price && Number(parsed.price) > 0) setPrice(String(Number(parsed.price)));
      if (parsed.category && categories.some((c) => c.id === parsed.category)) setCategory(parsed.category);
      if (parsed.note) setNote(String(parsed.note).trim());
      setScanNotice("已辨識完成，請確認內容無誤後再儲存。");
    } catch (e) {
      setScanError(e.message || "辨識失敗，請再試一次或直接手動輸入。");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,38,32,0.45)", zIndex: 30, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PAPER, width: "100%", maxWidth: 440, borderRadius: "20px 20px 0 0", padding: "16px 18px 22px", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 17, fontWeight: 800, margin: 0 }}>{isEdit ? "修改這一筆" : "新增一筆"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8072" }}><X size={20} /></button>
        </div>

        {!isEdit && (
          <div style={{ marginBottom: 16 }}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files[0]; if (f) handleScan(f); e.target.value = ""; }} />
            <button onClick={() => fileRef.current.click()} disabled={!hasKey || scanning}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "11px 0", borderRadius: 12, border: `1px solid ${hasKey ? STAMP : "#E0D5BC"}`,
                background: hasKey ? `${STAMP}0F` : "#fff", color: hasKey ? STAMP : "#B8AC91",
                fontWeight: 700, fontSize: 13, cursor: hasKey && !scanning ? "pointer" : "not-allowed",
              }}>
              {scanning ? <Loader2 size={15} className="spin" /> : <Camera size={15} />}
              {scanning ? "辨識中…" : hasKey ? "拍照 / 上傳發票自動帶入" : "拍照掃描發票（需先在設定加入 AI 金鑰）"}
            </button>
            <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
            {scanError && <div style={{ fontSize: 11.5, color: STAMP, marginTop: 6 }}>{scanError}</div>}
            {scanNotice && <div style={{ fontSize: 11.5, color: GOOD, marginTop: 6 }}>{scanNotice}</div>}
          </div>
        )}

        <label style={fieldLabel}>日期</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />

        <label style={fieldLabel}>分類</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              style={{
                border: category === c.id ? `2px solid ${c.color}` : "1px solid #E0D5BC",
                background: category === c.id ? `${c.color}1A` : "#fff",
                color: category === c.id ? c.color : "#5C5343",
                borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
              }}>
              <CatDot color={c.color} size={7} /> {c.name}
            </button>
          ))}
        </div>

        <label style={fieldLabel}>項目</label>
        <input type="text" placeholder="例如：晚餐、UBike、咖啡" value={item} onChange={(e) => setItem(e.target.value)}
          onFocus={() => showField("item")} onBlur={hideField} style={inputStyle} />
        {itemSuggestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "-6px 0 14px" }}>
            {itemSuggestions.map((s) => {
              const cat = categories.find((c) => c.id === s.cat);
              return (
                <button key={s.name} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickItem(s)} style={chipStyle}>
                  {cat && <CatDot color={cat.color} size={6} />}{s.name}
                </button>
              );
            })}
          </div>
        )}

        <label style={fieldLabel}>金額（可輸入 =100-10 這類算式）</label>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input ref={priceRef} type="text" inputMode={calcMode ? "text" : "decimal"} placeholder="0" value={price}
            onChange={(e) => setPrice(e.target.value)} onFocus={() => showField("price")} onBlur={commitPrice}
            style={{ ...inputStyle, marginBottom: priceParsed.isExpr || !priceParsed.ok ? 4 : 14, fontFamily: "'JetBrains Mono', monospace", fontSize: 18, flex: 1 }} />
          <button type="button" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setCalcMode(true); if (!String(price).trim().startsWith("=")) setPrice("=" + (price || "")); }}
            style={{ border: `1px solid ${STAMP}`, background: `${STAMP}0F`, color: STAMP, borderRadius: 12, width: 44, height: 43, fontSize: 20, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>=</button>
        </div>
        {priceSuggestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "2px 0 14px" }}>
            {priceSuggestions.map((p) => (
              <button key={p} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickPrice(p)}
                style={{ ...chipStyle, fontFamily: "'JetBrains Mono', monospace" }}>
                ${fmt(p)}
              </button>
            ))}
          </div>
        )}
        {priceParsed.isExpr && priceParsed.ok && (
          <div style={{ fontSize: 12.5, color: GOOD, margin: "0 2px 14px", fontFamily: "'JetBrains Mono', monospace" }}>= {priceParsed.value}</div>
        )}
        {!priceParsed.ok && priceParsed.error && priceParsed.error !== "empty" && (
          <div style={{ fontSize: 12, color: STAMP, margin: "0 2px 14px" }}>{priceParsed.error}</div>
        )}
        {!priceParsed.ok && priceParsed.error === "empty" && (
          <div style={{ fontSize: 12, color: "#8A8072", margin: "0 2px 14px" }}>在 = 後面輸入算式，例如 =100-10</div>
        )}

        <label style={fieldLabel}>備註（選填）</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />

        <button onClick={handleSubmit} disabled={!canSubmit}
          style={{ width: "100%", marginTop: 10, padding: "13px 0", borderRadius: 14, border: "none", background: canSubmit ? STAMP : "#D8CBAE", color: "#fff", fontWeight: 700, fontSize: 15, cursor: canSubmit ? "pointer" : "not-allowed" }}>
          {isEdit ? "更新這一筆" : "記一筆"}
        </button>
      </div>
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
