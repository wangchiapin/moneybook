import React, { useState } from "react";
import { Lock } from "lucide-react";
import { GOOD, STAMP, fmt } from "./lib.js";

export function CatDot({ color, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}

export function StampBadge({ value, size = 108 }) {
  const positive = value >= 0;
  const color = positive ? GOOD : STAMP;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        border: `2.5px double ${color}`,
        color, opacity: 0.94,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        transform: "rotate(-9deg)", fontFamily: "'Noto Serif TC', serif",
        flexShrink: 0, background: "rgba(255,255,255,0.25)",
      }}
    >
      <span style={{ fontSize: 10, letterSpacing: 3, marginBottom: 2 }}>本月損益</span>
      <span style={{ fontSize: 17, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
        {positive ? "+" : "－"}{fmt(Math.abs(value))}
      </span>
    </div>
  );
}

export function Tile({ label, value, color }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "12px 8px", textAlign: "center", border: "1px solid #ECE1C9" }}>
      <div style={{ fontSize: 11, color: "#A79C89", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, color }}>${fmt(value)}</div>
    </div>
  );
}

// Reusable password gate. Shows `children` once `unlocked` is true; otherwise
// shows a small password form and calls `onUnlock(password)` (expected to
// return a boolean / Promise<boolean>) on submit. Used by both the 統計 tab
// and the 記帳 tab's 分類明細 card, sharing the same unlock state so the
// user only has to enter the password once per session.
export function PasswordGate({ unlocked, onUnlock, compact = false, message, children }) {
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [checking, setChecking] = useState(false);

  if (unlocked) return children;

  const submit = async (e) => {
    e.preventDefault();
    setChecking(true);
    const ok = await onUnlock(pwInput);
    setChecking(false);
    if (!ok) { setPwError(true); setPwInput(""); } else { setPwError(false); }
  };

  return (
    <div style={{ textAlign: "center", padding: compact ? "26px 10px" : "48px 24px" }}>
      <Lock size={compact ? 20 : 28} color="#B8AC91" style={{ marginBottom: compact ? 10 : 14 }} />
      <div style={{ fontSize: compact ? 12.5 : 14, color: "#5C5343", marginBottom: compact ? 12 : 18, lineHeight: 1.6 }}>
        {message || "此區域已鎖定，請輸入密碼查看"}
      </div>
      <form onSubmit={submit} style={{ maxWidth: compact ? 180 : 220, margin: "0 auto" }}>
        <input
          type="password" inputMode="numeric" autoFocus={!compact} placeholder="密碼" value={pwInput}
          onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
          style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${pwError ? STAMP : "#E0D5BC"}`, borderRadius: 10, padding: compact ? "7px 10px" : "10px 12px", fontSize: compact ? 13 : 15, textAlign: "center", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}
        />
        {pwError && <div style={{ fontSize: 11.5, color: STAMP, marginBottom: 8 }}>密碼不正確</div>}
        <button type="submit" disabled={checking}
          style={{ width: "100%", padding: compact ? "7px 0" : "10px 0", borderRadius: 10, border: "none", background: STAMP, color: "#fff", fontWeight: 700, fontSize: compact ? 12.5 : 14, cursor: "pointer" }}>
          {checking ? "確認中…" : "解鎖"}
        </button>
      </form>
    </div>
  );
}

export const fieldLabel = { display: "block", fontSize: 11.5, color: "#8A8072", fontWeight: 700, letterSpacing: 0.5, margin: "0 2px 6px" };
export const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid #E0D5BC", borderRadius: 12, padding: "10px 12px", fontSize: 14, marginBottom: 14, background: "#fff", color: "#2B2620" };
export const thStyle = { padding: "6px 8px", textAlign: "right", color: "#8A8072", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid #ECE1C9" };
export const tdStyle = { padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid #F3ECDA", fontFamily: "'JetBrains Mono', monospace" };
