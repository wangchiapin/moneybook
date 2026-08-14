import React, { useState } from "react";
import { X } from "lucide-react";
import { PAPER, STAMP, todayISO, monthKeyOf } from "./lib.js";
import { CatDot, fieldLabel, inputStyle } from "./components.jsx";

export default function AddExpenseSheet({ viewMonth, categories, onClose, onSubmit }) {
  const [date, setDate] = useState(() => {
    const t = todayISO();
    return monthKeyOf(t) === viewMonth ? t : `${viewMonth}-01`;
  });
  const [category, setCategory] = useState(categories[0]?.id || "");
  const [item, setItem] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");

  const canSubmit = price !== "" && Number(price) > 0 && category;
  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ date, category, item: item.trim(), price: Number(price), note: note.trim() });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,38,32,0.45)", zIndex: 30, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PAPER, width: "100%", maxWidth: 440, borderRadius: "20px 20px 0 0", padding: "16px 18px 22px", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 17, fontWeight: 800, margin: 0 }}>新增一筆</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8072" }}><X size={20} /></button>
        </div>

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
        <input type="text" placeholder="例如：晚餐、UBike、咖啡" value={item} onChange={(e) => setItem(e.target.value)} style={inputStyle} />

        <label style={fieldLabel}>金額</label>
        <input type="number" inputMode="numeric" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 18 }} />

        <label style={fieldLabel}>備註（選填）</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />

        <button onClick={handleSubmit} disabled={!canSubmit}
          style={{ width: "100%", marginTop: 10, padding: "13px 0", borderRadius: 14, border: "none", background: canSubmit ? STAMP : "#D8CBAE", color: "#fff", fontWeight: 700, fontSize: 15, cursor: canSubmit ? "pointer" : "not-allowed" }}>
          記一筆
        </button>
      </div>
    </div>
  );
}
