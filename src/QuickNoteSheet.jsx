import React, { useState } from "react";
import { X, RefreshCw, Trash2, CheckCircle2 } from "lucide-react";
import { PAPER, STAMP, GOOD, todayISO, parseQuickNoteText } from "./lib.js";
import { fieldLabel } from "./components.jsx";

export default function QuickNoteSheet({ categories, initialDraft, onClose, onConfirm, onSaveDraft }) {
  const [text, setText] = useState(initialDraft || "");
  const [parsed, setParsed] = useState(null); // { candidates, unresolved } | null
  const [addedMsg, setAddedMsg] = useState("");

  const runParse = () => {
    const result = parseQuickNoteText(text, todayISO(), categories);
    setParsed(result);
    setAddedMsg("");
  };

  const updateCandidate = (tempId, patch) => {
    setParsed((p) => ({ ...p, candidates: p.candidates.map((c) => (c.tempId === tempId ? { ...c, ...patch } : c)) }));
  };
  const removeCandidate = (tempId) => {
    setParsed((p) => ({ ...p, candidates: p.candidates.filter((c) => c.tempId !== tempId) }));
  };

  const closeAndSave = () => {
    onSaveDraft(text);
    onClose();
  };

  const confirmAll = () => {
    if (!parsed || parsed.candidates.length === 0) return;
    onConfirm(parsed.candidates);
    const remainingText = parsed.unresolved.join("\n");
    setText(remainingText);
    onSaveDraft(remainingText);
    setAddedMsg(`已新增 ${parsed.candidates.length} 筆到記帳`);
    setParsed({ candidates: [], unresolved: parsed.unresolved });
  };

  const inputSm = { border: "1px solid #E0D5BC", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff", color: "#2B2620" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,38,32,0.45)", zIndex: 35, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={closeAndSave}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PAPER, width: "100%", maxWidth: 460, borderRadius: "20px 20px 0 0", padding: "16px 18px 22px", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 17, fontWeight: 800, margin: 0 }}>隨手記</h2>
          <button onClick={closeAndSave} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8072" }}><X size={20} /></button>
        </div>

        <div style={{ fontSize: 12, color: "#8A8072", lineHeight: 1.6, marginBottom: 10 }}>
          想到什麼先隨手打一行，之後再整理分類。格式例如：<br />
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>0913 早餐 500 午餐300 晚餐600</span>
        </div>

        <label style={fieldLabel}>快速記錄</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E0D5BC", borderRadius: 12, padding: "10px 12px", fontSize: 14, marginBottom: 10, fontFamily: "'JetBrains Mono', monospace", resize: "vertical" }}
        />

        <button onClick={runParse}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 0", borderRadius: 12, border: "none", background: STAMP, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>
          <RefreshCw size={15} /> 解析
        </button>

        {addedMsg && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: GOOD, marginBottom: 14 }}>
            <CheckCircle2 size={14} /> {addedMsg}
          </div>
        )}

        {parsed && parsed.candidates.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#8A8072", marginBottom: 8, letterSpacing: 1 }}>
              待確認新增（{parsed.candidates.length} 筆）
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {parsed.candidates.map((c) => {
                const incomplete = !c.category || !c.item.trim() || !(Number(c.price) > 0);
                return (
                  <div key={c.tempId} style={{ background: incomplete ? "#FBE4E1" : "#fff", border: "1px solid #ECE1C9", borderRadius: 12, padding: 10 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                      <input type="date" value={c.date} onChange={(e) => updateCandidate(c.tempId, { date: e.target.value })} style={{ ...inputSm, flex: 1 }} />
                      <select value={c.category} onChange={(e) => updateCandidate(c.tempId, { category: e.target.value })} style={{ ...inputSm, flex: 1 }}>
                        <option value="">未分類</option>
                        {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                      </select>
                      <button onClick={() => removeCandidate(c.tempId)} style={{ background: "none", border: "none", color: "#B8AC91", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="text" placeholder="項目" value={c.item} onChange={(e) => updateCandidate(c.tempId, { item: e.target.value })} style={{ ...inputSm, flex: 2 }} />
                      <input type="number" placeholder="金額" value={c.price || ""} onChange={(e) => updateCandidate(c.tempId, { price: Number(e.target.value) || 0 })} style={{ ...inputSm, flex: 1, fontFamily: "'JetBrains Mono', monospace" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {parsed && parsed.unresolved.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#8A8072", marginBottom: 8, letterSpacing: 1 }}>
              看不懂的內容（不會加入記帳）
            </div>
            <div style={{ background: "#F3ECDA", borderRadius: 12, padding: "10px 12px", fontSize: 12.5, color: "#5C5343", lineHeight: 1.8 }}>
              {parsed.unresolved.map((line, i) => (<div key={i}>· {line}</div>))}
            </div>
            <div style={{ fontSize: 11, color: "#A79C89", marginTop: 6 }}>
              請到上面文字框修改後再按一次「解析」，或關閉視窗，內容會先幫你留著。
            </div>
          </div>
        )}

        {parsed && parsed.candidates.length > 0 && (
          <button onClick={confirmAll}
            style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: "none", background: GOOD, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
            確認並加入記帳（{parsed.candidates.length} 筆）
          </button>
        )}
      </div>
    </div>
  );
}
