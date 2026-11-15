import React, { useRef, useState } from "react";
import { X, FileUp } from "lucide-react";
import { PAPER, STAMP, GOOD, genId, todayISO, fmt } from "./lib.js";
import { fieldLabel, inputStyle } from "./components.jsx";
import { findInvoiceName, setInvoiceName, DEFAULT_PHONE_ITEM } from "./invoiceImport.js";
import {
  PDF_BILL_SUPPORTED, readPdfText, parseTwmBillText, addPendingBill, removePendingBill,
  getSavedPdfPasswords, rememberPdfPassword, forgetPdfPasswords,
} from "./pdfBill.js";

// 待扣款：電信帳單沒有付款證明，先放這裡；等你在信用卡 APP 看到真的扣了，再按「已扣款，記帳」。
export default function PendingBillsModal({
  pendingBills, setPendingBillsPersist,
  expenses, incomes, setDataPersist,
  categories, invoiceNames, setInvoiceNamesPersist,
  onClose,
}) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [need, setNeed] = useState(null); // { file, wrong }
  const [pw, setPw] = useState("");
  const [rememberPw, setRememberPw] = useState(true);
  const [confirmDel, setConfirmDel] = useState(null);
  const [draft, setDraft] = useState(null); // 正在確認記帳的那一筆
  const list = Array.isArray(pendingBills) ? pendingBills : [];

  const defaultCategory = () => (categories.find((c) => c.id === "居家") || categories[0] || { id: "" }).id;

  // 讀一份 PDF：先用這台裝置記住的密碼試，不行再問
  const readFile = async (file, typedPw) => {
    setBusy(true);
    setMsg("");
    try {
      const buf = await file.arrayBuffer();
      const tries = typedPw ? [typedPw] : ["", ...getSavedPdfPasswords()];
      let text = null, lastErr = null, usedPw = "";
      for (const p of tries) {
        try { text = await readPdfText(buf, p); usedPw = p; break; } catch (e) {
          lastErr = e;
          if (!e.needPassword) throw e;
        }
      }
      if (text === null) {
        setNeed({ file, wrong: !!(typedPw && lastErr && lastErr.wrongPassword) });
        return;
      }
      setNeed(null);
      if (usedPw && rememberPw && typedPw) rememberPdfPassword(usedPw);
      if (text.replace(/\s/g, "").length < 20) {
        setMsg("這份 PDF 裡沒有文字（可能是用「列印成 PDF」存的圖片）。請用信件附件的原始 PDF 檔。");
        return;
      }
      const r = parseTwmBillText(text, todayISO());
      if (!r.ok) { setMsg(`${file.name}：${r.error}`); return; }
      if (list.some((b) => b.billNo === r.billNo)) { setMsg(`這份帳單（${r.billNo}）已經在待扣款清單裡了。`); return; }
      if (expenses.some((e) => e.invoiceNo === r.billNo)) { setMsg(`這份帳單（${r.billNo}）已經記過帳了。`); return; }
      setPendingBillsPersist(addPendingBill(list, {
        id: genId(), billNo: r.billNo, provider: "台灣大哥大", phoneMasked: r.phoneMasked,
        amount: r.amount, billMonthLabel: r.billMonthLabel, noPayNeeded: r.noPayNeeded, addedAt: Date.now(),
      }));
      setMsg(r.warnings.length ? `已加入待扣款。注意：${r.warnings.join("；")}` : "已加入待扣款清單。");
    } catch (e) {
      console.error(e);
      setMsg("讀取失敗：" + (e && e.message ? e.message : e));
    } finally {
      setBusy(false);
      setPw("");
    }
  };

  const openConfirm = (b) => {
    const remembered = findInvoiceName(invoiceNames, b.phoneMasked);
    setDraft({
      bill: b, date: todayISO(), category: defaultCategory(),
      item: remembered || DEFAULT_PHONE_ITEM, saveName: !remembered, remembered,
      price: String(b.amount), note: b.billMonthLabel || "",
    });
  };
  const problem = (d) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return "日期要寫成 2026-11-24 這樣";
    if (!d.category) return "請選分類";
    if (!d.item.trim()) return "請填項目";
    if (!(Number(d.price) > 0)) return "金額要大於 0";
    return "";
  };
  const record = () => {
    if (!draft || problem(draft)) return;
    const d = draft;
    setDataPersist([...expenses, {
      id: genId(), date: d.date, category: d.category, item: d.item.trim(), price: Number(d.price),
      note: (d.note || "").trim(), invoiceNo: d.bill.billNo,
    }], incomes);
    if (d.bill.phoneMasked && d.saveName && findInvoiceName(invoiceNames, d.bill.phoneMasked) !== d.item.trim()) {
      setInvoiceNamesPersist(setInvoiceName(invoiceNames, d.bill.phoneMasked, d.item));
    }
    setPendingBillsPersist(removePendingBill(list, d.bill.id));
    setDraft(null);
    setMsg("已記帳，並從待扣款清單拿掉。");
  };

  const btn = (primary) => ({
    padding: "9px 0", borderRadius: 10, fontWeight: 700, fontSize: 13.5, cursor: "pointer",
    border: primary ? "none" : "1px solid #E0D5BC", background: primary ? STAMP : "#fff", color: primary ? "#fff" : "#5C5343",
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(40,30,20,0.45)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: PAPER, width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>待扣款</div>
          <button onClick={onClose} aria-label="關閉" style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8072" }}><X size={20} /></button>
        </div>

        <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) readFile(f); }} />
        <button onClick={() => fileRef.current.click()} disabled={busy}
          style={{ ...btn(false), width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 4 }}>
          <FileUp size={15} /> {busy ? "讀取中…" : "匯入 PDF 帳單"}
        </button>
        <div style={{ fontSize: 12, color: "#8A8072", marginBottom: 10 }}>目前認得：{PDF_BILL_SUPPORTED}</div>

        {need && (
          <div style={{ background: "#fff", border: "1px solid #E0D5BC", borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 13, marginBottom: 6, color: need.wrong ? STAMP : "#3A342A" }}>
              {need.wrong ? "密碼不正確，請再輸入一次" : "這份帳單有密碼，請輸入"}
            </div>
            <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && pw) readFile(need.file, pw); }}
              style={{ ...inputStyle, marginBottom: 8 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#5C5343", marginBottom: 8 }}>
              <input type="checkbox" checked={rememberPw} onChange={(e) => setRememberPw(e.target.checked)} />
              記住在這台裝置（不會上傳到雲端）
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setNeed(null); setPw(""); }} style={{ ...btn(false), flex: 1 }}>取消</button>
              <button onClick={() => pw && readFile(need.file, pw)} style={{ ...btn(true), flex: 2, opacity: pw ? 1 : 0.45 }}>讀取</button>
            </div>
          </div>
        )}

        {msg && <div style={{ fontSize: 13, color: "#3A342A", background: "#fff", border: "1px solid #ECE1C9", borderRadius: 10, padding: "8px 10px", marginBottom: 10 }}>{msg}</div>}

        {list.length === 0 && !draft && (
          <div style={{ textAlign: "center", color: "#A79C89", fontSize: 13, padding: "18px 0" }}>目前沒有待扣款的帳單</div>
        )}

        {list.map((b) => {
          const isDraft = draft && draft.bill.id === b.id;
          return (
            <div key={b.id} style={{ background: "#fff", border: "1px solid #ECE1C9", borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                {b.provider}　{findInvoiceName(invoiceNames, b.phoneMasked) || `電話費 ${b.phoneMasked || ""}`}
              </div>
              <div style={{ fontSize: 12, color: "#8A8072", marginBottom: 8 }}>{b.billMonthLabel}　應繳 {fmt(b.amount)} 元</div>
              {b.noPayNeeded && (
                <div style={{ fontSize: 12, color: STAMP, marginBottom: 8 }}>這期帳單寫「暫無需繳款，併入次期」，這個月不會扣；等下一期帳單來再看。</div>
              )}
              {!isDraft ? (
                <div style={{ display: "flex", gap: 8 }}>
                  {confirmDel === b.id ? (
                    <button onClick={() => { setPendingBillsPersist(removePendingBill(list, b.id)); setConfirmDel(null); }}
                      style={{ ...btn(true), flex: 1 }}>確定刪除</button>
                  ) : (
                    <button onClick={() => setConfirmDel(b.id)} style={{ ...btn(false), flex: 1 }}>刪除</button>
                  )}
                  <button onClick={() => openConfirm(b)} style={{ ...btn(true), flex: 2 }}>已扣款，記帳</button>
                </div>
              ) : (
                <div>
                  <label style={fieldLabel}>扣款日（看信用卡 APP 的日期）</label>
                  <input type="text" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} style={inputStyle} />
                  <label style={fieldLabel}>分類</label>
                  <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} style={inputStyle}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <label style={fieldLabel}>項目</label>
                  <input type="text" value={draft.item} onChange={(e) => setDraft({ ...draft, item: e.target.value })} style={inputStyle} />
                  {b.phoneMasked && (!draft.remembered || draft.item.trim() !== draft.remembered) && (
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#5C5343", margin: "6px 0" }}>
                      <input type="checkbox" checked={draft.saveName} onChange={(e) => setDraft({ ...draft, saveName: e.target.checked })} />
                      {draft.remembered ? "之後這支電話都用這個名稱" : "記住這個項目名稱"}
                    </label>
                  )}
                  <label style={fieldLabel}>金額（帳單 {fmt(b.amount)} 元，實際扣多少可以改）</label>
                  <input type="text" inputMode="numeric" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} style={inputStyle} />
                  <label style={fieldLabel}>備註</label>
                  <input type="text" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} style={{ ...inputStyle, marginBottom: 4 }} />
                  {problem(draft) && <div style={{ fontSize: 12, color: STAMP, margin: "6px 0" }}>{problem(draft)}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => setDraft(null)} style={{ ...btn(false), flex: 1 }}>取消</button>
                    <button onClick={record} style={{ ...btn(true), flex: 2, background: GOOD, opacity: problem(draft) ? 0.45 : 1 }}>寫進帳本</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {getSavedPdfPasswords().length > 0 && (
          <button onClick={() => { forgetPdfPasswords(); setMsg("已清除這台裝置記住的 PDF 密碼。"); }}
            style={{ background: "none", border: "none", color: "#8A8072", fontSize: 12, textDecoration: "underline", cursor: "pointer", marginTop: 4 }}>
            清除這台裝置記住的密碼
          </button>
        )}
      </div>
    </div>
  );
}
