import React, { useRef, useState } from "react";
import { X, Plus, Trash2, Download, Upload, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import { PAPER, STAMP, GOOD, INCOME_SOURCES, genId, todayISO } from "./lib.js";
import { CatDot, fieldLabel, inputStyle } from "./components.jsx";

const PALETTE = ["#C1622D", "#B4637A", "#2F6F62", "#4A6FA5", "#A97C50", "#7B5E7B", "#5B5B5B", "#4B5A85", "#3F7D5C", "#C79A2A", "#8C8474", "#A3352A", "#6B8E23", "#B5533C"];

export default function SettingsModal({
  categories, setCategoriesPersist,
  expenses, incomes, setDataPersist,
  onClose,
}) {
  const [section, setSection] = useState("categories"); // categories | data
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  const [deleteBlocked, setDeleteBlocked] = useState(null);
  const [importMsg, setImportMsg] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const backupFileRef = useRef(null);
  const legacyFileRef = useRef(null);

  const usedCategoryIds = new Set(expenses.map((e) => e.category));

  const addCategory = () => {
    const name = newName.trim();
    if (!name) return;
    if (categories.some((c) => c.id === name)) { setNewName(""); return; }
    const next = [...categories, { id: name, name, color: newColor }];
    setCategoriesPersist(next);
    setNewName("");
    setNewColor(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  };

  const renameCategory = (id, name) => {
    setCategoriesPersist(categories.map((c) => (c.id === id ? { ...c, name } : c)));
  };
  const recolorCategory = (id, color) => {
    setCategoriesPersist(categories.map((c) => (c.id === id ? { ...c, color } : c)));
  };
  const deleteCategory = (id) => {
    if (usedCategoryIds.has(id)) { setDeleteBlocked(id); setTimeout(() => setDeleteBlocked(null), 2200); return; }
    setCategoriesPersist(categories.filter((c) => c.id !== id));
  };

  // ---- export ----
  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    const wsExp = XLSX.utils.json_to_sheet(
      expenses.map((e) => ({ 日期: e.date, 分類: e.category, 項目: e.item, 金額: e.price, 備註: e.note || "" }))
    );
    const wsInc = XLSX.utils.json_to_sheet(
      incomes.map((i) => ({ 月份: i.month, 來源: i.source, 金額: i.amount }))
    );
    XLSX.utils.book_append_sheet(wb, wsExp, "支出");
    XLSX.utils.book_append_sheet(wb, wsInc, "收入");
    XLSX.writeFile(wb, `生活帳本備份_${todayISO()}.xlsx`);
  };

  // ---- import: our own backup format ----
  const importBackup = async (file) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const expRows = wb.Sheets["支出"] ? XLSX.utils.sheet_to_json(wb.Sheets["支出"]) : [];
    const incRows = wb.Sheets["收入"] ? XLSX.utils.sheet_to_json(wb.Sheets["收入"]) : [];
    const newExpenses = expRows
      .filter((r) => r["日期"] && r["分類"] && r["金額"])
      .map((r) => ({
        id: genId(),
        date: normalizeDate(r["日期"]),
        category: String(r["分類"]).trim(),
        item: r["項目"] ? String(r["項目"]).trim() : "",
        price: Number(r["金額"]),
        note: r["備註"] ? String(r["備註"]).trim() : "",
      }))
      .filter((e) => e.date && e.price > 0);
    const newIncomes = incRows
      .filter((r) => r["月份"] && r["來源"] && r["金額"])
      .map((r) => ({ id: genId(), month: String(r["月份"]).trim(), source: String(r["來源"]).trim(), amount: Number(r["金額"]) }));
    const nextExpenses = [...expenses, ...newExpenses];
    const nextIncomes = [...incomes, ...newIncomes];
    setDataPersist(nextExpenses, nextIncomes);
    setImportMsg(`匯入了 ${newExpenses.length} 筆支出、${newIncomes.length} 筆收入`);
  };

  // ---- import: legacy multi-sheet-per-month excel (original spreadsheet format) ----
  // Note: in the original workbook, the 日期 (date) cell is merged down across every
  // entry belonging to the same day, so only the first row of each day actually carries
  // a date value — every other row's date cell is blank. We forward-fill the last seen
  // date so those rows aren't silently dropped.
  const importLegacy = async (file) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const newExpenses = [];
    const newIncomes = [];
    let skipped = 0;
    wb.SheetNames.forEach((sheetName) => {
      const m = sheetName.match(/^(\d+)-(\d+)\s*月$/);
      if (!m) return;
      const gregYear = Number(m[1]) + 1911;
      const monthKey = `${gregYear}-${String(Number(m[2])).padStart(2, "0")}`;
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
      let lastDate = null;
      rows.forEach((row) => {
        const dateCell = row[0];
        if (dateCell) {
          const iso = normalizeDate(dateCell);
          if (iso) lastDate = iso;
        }
        const cat = row[1];
        const item = row[2];
        const price = toNumber(row[3]);
        const isRealCategory = typeof cat === "string" && cat.trim() && !["總計", "小計", "扣掉卡費", "收入", "收支損益"].includes(cat.trim());
        if (lastDate && isRealCategory && price !== null && price > 0) {
          newExpenses.push({
            id: genId(), date: lastDate, category: cat.trim(),
            item: item !== undefined && item !== null ? String(item).trim() : "", price,
            note: row[5] ? String(row[5]).trim() : "",
          });
        } else if (dateCell && isRealCategory && price === null) {
          skipped += 1;
        }
        const incLabel = row[7];
        const incAmount = toNumber(row[8]);
        if (INCOME_SOURCES.includes(incLabel) && incAmount !== null && incAmount > 0) {
          newIncomes.push({ id: genId(), month: monthKey, source: incLabel, amount: incAmount });
        }
      });
    });
    const nextExpenses = [...expenses, ...newExpenses];
    const nextIncomes = [...incomes, ...newIncomes];
    setDataPersist(nextExpenses, nextIncomes);
    setImportMsg(`從舊版 Excel 匯入了 ${newExpenses.length} 筆支出、${newIncomes.length} 筆收入${skipped ? `（${skipped} 筆金額欄位無法辨識，已略過）` : ""}`);
  };

  const clearAll = () => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return; }
    setDataPersist([], []);
    setConfirmClear(false);
    setImportMsg("已清空所有記帳資料");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,38,32,0.45)", zIndex: 40, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PAPER, width: "100%", maxWidth: 440, borderRadius: "20px 20px 0 0", padding: "16px 18px 26px", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 17, fontWeight: 800, margin: 0 }}>設定</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8072" }}><X size={20} /></button>
        </div>

        <div style={{ display: "flex", background: "#EDE4D0", borderRadius: 999, padding: 4, marginBottom: 16, gap: 4 }}>
          {[["categories", "分類管理"], ["data", "備份與匯入"]].map(([key, label]) => (
            <button key={key} onClick={() => setSection(key)}
              style={{
                flex: 1, border: "none", cursor: "pointer", padding: "8px 0", borderRadius: 999,
                background: section === key ? "#fff" : "transparent", color: section === key ? STAMP : "#8A8072",
                fontWeight: section === key ? 700 : 500, fontSize: 13,
              }}>
              {label}
            </button>
          ))}
        </div>

        {section === "categories" && (
          <div>
            {categories.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #F3ECDA" }}>
                <input type="color" value={c.color} onChange={(e) => recolorCategory(c.id, e.target.value)} style={{ width: 26, height: 26, border: "none", borderRadius: 6, padding: 0, background: "none", cursor: "pointer" }} />
                <input
                  type="text" defaultValue={c.name}
                  onBlur={(e) => { if (e.target.value.trim()) renameCategory(c.id, e.target.value.trim()); }}
                  style={{ flex: 1, border: "1px solid #E0D5BC", borderRadius: 8, padding: "6px 8px", fontSize: 13 }}
                />
                {deleteBlocked === c.id ? (
                  <span style={{ fontSize: 11, color: STAMP, maxWidth: 90 }}>已有支出使用</span>
                ) : (
                  <button onClick={() => deleteCategory(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B8AC91", padding: 4 }}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: 26, height: 26, border: "none", borderRadius: 6, padding: 0, background: "none", cursor: "pointer" }} />
              <input
                type="text" placeholder="新分類名稱" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
                style={{ flex: 1, border: "1px solid #E0D5BC", borderRadius: 8, padding: "6px 8px", fontSize: 13 }}
              />
              <button onClick={addCategory} style={{ background: STAMP, border: "none", color: "#fff", borderRadius: 8, padding: 7, cursor: "pointer" }}>
                <Plus size={16} />
              </button>
            </div>
          </div>
        )}

        {section === "data" && (
          <div>
            <button onClick={exportXlsx}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", borderRadius: 12, border: "none", background: STAMP, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>
              <Download size={16} /> 匯出目前資料（.xlsx）
            </button>

            <input ref={backupFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files[0]; if (f) importBackup(f); e.target.value = ""; }} />
            <button onClick={() => backupFileRef.current.click()}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", borderRadius: 12, border: "1px solid #E0D5BC", background: "#fff", color: "#2B2620", fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>
              <Upload size={16} /> 匯入本工具備份檔
            </button>

            <input ref={legacyFileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files[0]; if (f) importLegacy(f); e.target.value = ""; }} />
            <button onClick={() => legacyFileRef.current.click()}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", borderRadius: 12, border: "1px solid #E0D5BC", background: "#fff", color: "#2B2620", fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>
              <Upload size={16} /> 匯入舊版 Excel 記帳本（歷史資料一次搬過來）
            </button>

            {importMsg && <div style={{ fontSize: 12, color: GOOD, marginBottom: 10 }}>{importMsg}</div>}

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed #D8CBAE" }}>
              <div style={{ fontSize: 11, color: "#A79C89", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <AlertTriangle size={13} /> 危險區域
              </div>
              <button onClick={clearAll}
                style={{ width: "100%", padding: "11px 0", borderRadius: 12, border: `1px solid ${STAMP}`, background: confirmClear ? STAMP : "#fff", color: confirmClear ? "#fff" : STAMP, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {confirmClear ? "再按一次確定清空所有資料" : "清空所有記帳資料"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function toNumber(cell) {
  if (typeof cell === "number" && !Number.isNaN(cell)) return cell;
  if (typeof cell === "string" && cell.trim() !== "" && !Number.isNaN(Number(cell))) return Number(cell);
  return null;
}

function normalizeDate(cell) {
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "string") {
    const m = cell.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  }
  if (typeof cell === "number") {
    const d = XLSX.SSF.parse_date_code(cell);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return null;
}
