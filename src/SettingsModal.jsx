import React, { useRef, useState } from "react";
import { X, Plus, Trash2, Download, Upload, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import { PAPER, STAMP, GOOD, LEGACY_INCOME_LABELS, SYNCED_INCOME_SOURCE_ID, DEFAULT_APP_NAME, genId, todayISO } from "./lib.js";
import { CatDot, fieldLabel, inputStyle } from "./components.jsx";

const PALETTE = ["#C1622D", "#B4637A", "#2F6F62", "#4A6FA5", "#A97C50", "#7B5E7B", "#5B5B5B", "#4B5A85", "#3F7D5C", "#C79A2A", "#8C8474", "#A3352A", "#6B8E23", "#B5533C"];

const SECTION_TABS = [
  ["general", "一般設定"],
  ["categories", "分類管理"],
  ["income", "收入來源"],
  ["data", "備份與匯入"],
  ["ai", "AI 分析"],
  ["lock", "修改密碼"],
];

export default function SettingsModal({
  appName, setAppNamePersist,
  categories, setCategoriesPersist,
  incomeSources, setIncomeSourcesPersist,
  expenses, incomes, setDataPersist,
  aiSettings, setAiSettingsPersist,
  setStatsPasswordPersist,
  initialSection,
  onClose,
}) {
  const [section, setSection] = useState(initialSection || "categories"); // general | categories | income | data | ai | lock
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  const [deleteBlocked, setDeleteBlocked] = useState(null);
  const [importMsg, setImportMsg] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [keyDraft, setKeyDraft] = useState(aiSettings?.apiKey || "");
  const [modelDraft, setModelDraft] = useState(aiSettings?.model || "gemini-flash-latest");
  const [keySaved, setKeySaved] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [appNameDraft, setAppNameDraft] = useState(appName || DEFAULT_APP_NAME);
  const [appNameSaved, setAppNameSaved] = useState(false);
  const [newIncomeName, setNewIncomeName] = useState("");
  const [incomeDeleteBlocked, setIncomeDeleteBlocked] = useState(null);
  const backupFileRef = useRef(null);
  const legacyFileRef = useRef(null);

  const usedCategoryIds = new Set(expenses.map((e) => e.category));
  const usedIncomeSourceIds = new Set(incomes.map((i) => i.source));

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

  // ---- income sources ----
  const addIncomeSource = () => {
    const name = newIncomeName.trim();
    if (!name) return;
    const next = [...incomeSources, { id: genId(), name }];
    setIncomeSourcesPersist(next);
    setNewIncomeName("");
  };
  const renameIncomeSource = (id, name) => {
    setIncomeSourcesPersist(incomeSources.map((s) => (s.id === id ? { ...s, name } : s)));
  };
  const deleteIncomeSource = (id) => {
    if (id === SYNCED_INCOME_SOURCE_ID || usedIncomeSourceIds.has(id)) {
      setIncomeDeleteBlocked(id);
      setTimeout(() => setIncomeDeleteBlocked(null), 2200);
      return;
    }
    setIncomeSourcesPersist(incomeSources.filter((s) => s.id !== id));
  };

  // ---- app name ----
  const saveAppName = () => {
    setAppNamePersist(appNameDraft);
    setAppNameSaved(true);
    setTimeout(() => setAppNameSaved(false), 2000);
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
        if (LEGACY_INCOME_LABELS.includes(incLabel) && incAmount !== null && incAmount > 0) {
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

  const saveAISettings = () => {
    setAiSettingsPersist({ apiKey: keyDraft.trim(), model: modelDraft.trim() || "gemini-flash-latest" });
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,38,32,0.45)", zIndex: 40, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PAPER, width: "100%", maxWidth: 440, borderRadius: "20px 20px 0 0", padding: "16px 18px 26px", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 17, fontWeight: 800, margin: 0 }}>設定</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8072" }}><X size={20} /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", background: "#EDE4D0", borderRadius: 16, padding: 4, marginBottom: 16, gap: 4 }}>
          {SECTION_TABS.map(([key, label]) => (
            <button key={key} onClick={() => setSection(key)}
              style={{
                border: "none", cursor: "pointer", padding: "8px 2px", borderRadius: 12,
                background: section === key ? "#fff" : "transparent", color: section === key ? STAMP : "#8A8072",
                fontWeight: section === key ? 700 : 500, fontSize: 12,
              }}>
              {label}
            </button>
          ))}
        </div>

        {section === "general" && (
          <div>
            <div style={{ fontSize: 12, color: "#8A8072", lineHeight: 1.6, marginBottom: 14 }}>
              修改整個帳本顯示的名稱，會套用在頁面標題與登入後的抬頭上。
            </div>
            <label style={{ display: "block", fontSize: 11.5, color: "#8A8072", fontWeight: 700, marginBottom: 6 }}>帳本名稱</label>
            <input
              type="text" placeholder="生活帳本" value={appNameDraft}
              onChange={(e) => setAppNameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveAppName(); }}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E0D5BC", borderRadius: 10, padding: "9px 12px", fontSize: 14, marginBottom: 12 }}
            />
            <button onClick={saveAppName}
              style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: appNameSaved ? GOOD : STAMP, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              {appNameSaved ? "已儲存" : "儲存名稱"}
            </button>
          </div>
        )}

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

        {section === "income" && (
          <div>
            <div style={{ fontSize: 12, color: "#8A8072", lineHeight: 1.6, marginBottom: 14 }}>
              管理「本月收入」會列出的項目。「華語文教學」由教學收入自動同步寫入，名稱可以改，但不能刪除；其他項目如果已有收入紀錄使用，也需要先清除紀錄才能刪除。
            </div>
            {incomeSources.map((s) => {
              const synced = s.id === SYNCED_INCOME_SOURCE_ID;
              const blocked = incomeDeleteBlocked === s.id;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #F3ECDA" }}>
                  <input
                    type="text" defaultValue={s.name}
                    onBlur={(e) => { if (e.target.value.trim()) renameIncomeSource(s.id, e.target.value.trim()); }}
                    style={{ flex: 1, border: "1px solid #E0D5BC", borderRadius: 8, padding: "6px 8px", fontSize: 13 }}
                  />
                  {synced && <RefreshHint />}
                  {blocked ? (
                    <span style={{ fontSize: 11, color: STAMP, maxWidth: 100 }}>{synced ? "自動同步，無法刪除" : "已有收入使用"}</span>
                  ) : (
                    <button onClick={() => deleteIncomeSource(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B8AC91", padding: 4 }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              );
            })}

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
              <input
                type="text" placeholder="新收入項目名稱" value={newIncomeName}
                onChange={(e) => setNewIncomeName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addIncomeSource(); }}
                style={{ flex: 1, border: "1px solid #E0D5BC", borderRadius: 8, padding: "6px 8px", fontSize: 13 }}
              />
              <button onClick={addIncomeSource} style={{ background: STAMP, border: "none", color: "#fff", borderRadius: 8, padding: 7, cursor: "pointer" }}>
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

        {section === "ai" && (
          <div>
            <div style={{ fontSize: 12, color: "#8A8072", lineHeight: 1.6, marginBottom: 14 }}>
              到 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: STAMP }}>Google AI Studio</a> 免費申請一組 API 金鑰貼在這裡，就能在「AI 分析」分頁請 Gemini 幫你看支出、給建議。申請時建議把金鑰限制成只能從你的網站網域呼叫，比較安全。
            </div>
            <label style={{ display: "block", fontSize: 11.5, color: "#8A8072", fontWeight: 700, marginBottom: 6 }}>Gemini API 金鑰</label>
            <input
              type="text" placeholder="AIzaSy..." value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E0D5BC", borderRadius: 10, padding: "9px 12px", fontSize: 13, marginBottom: 12, fontFamily: "'JetBrains Mono', monospace" }}
            />
            <label style={{ display: "block", fontSize: 11.5, color: "#8A8072", fontWeight: 700, marginBottom: 6 }}>模型名稱</label>
            <input
              type="text" placeholder="gemini-flash-latest" value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E0D5BC", borderRadius: 10, padding: "9px 12px", fontSize: 13, marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}
            />
            <div style={{ fontSize: 11, color: "#A79C89", marginBottom: 14 }}>如果之後 Google 改了免費模型名稱，改這裡就好，不用改程式。</div>
            <button onClick={saveAISettings}
              style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: keySaved ? GOOD : STAMP, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              {keySaved ? "已儲存" : "儲存設定"}
            </button>
          </div>
        )}

        {section === "lock" && (
          <div>
            <div style={{ fontSize: 12, color: "#8A8072", lineHeight: 1.6, marginBottom: 14 }}>
              「統計」分頁與「記帳」頁的「分類明細」都需要輸入這組密碼才能查看，預設密碼是 <b>0000</b>。在這裡可以改成你自己的密碼（4 碼以上皆可）。密碼只會用雜湊方式存起來，不會存明碼。
            </div>
            <label style={{ display: "block", fontSize: 11.5, color: "#8A8072", fontWeight: 700, marginBottom: 6 }}>新密碼</label>
            <input
              type="password" inputMode="numeric" placeholder="輸入新密碼" value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E0D5BC", borderRadius: 10, padding: "9px 12px", fontSize: 13, marginBottom: 12, fontFamily: "'JetBrains Mono', monospace" }}
            />
            <label style={{ display: "block", fontSize: 11.5, color: "#8A8072", fontWeight: 700, marginBottom: 6 }}>再輸入一次</label>
            <input
              type="password" inputMode="numeric" placeholder="再次輸入新密碼" value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E0D5BC", borderRadius: 10, padding: "9px 12px", fontSize: 13, marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}
            />
            {pwMsg && <div style={{ fontSize: 12, color: pwMsg.startsWith("已") ? GOOD : STAMP, marginBottom: 10 }}>{pwMsg}</div>}
            <button
              onClick={async () => {
                if (pw1.length < 4) { setPwMsg("密碼至少要 4 碼"); return; }
                if (pw1 !== pw2) { setPwMsg("兩次輸入的密碼不一樣"); return; }
                await setStatsPasswordPersist(pw1);
                setPwMsg("已更新密碼");
                setPw1(""); setPw2("");
              }}
              style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: STAMP, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              更新密碼
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RefreshHint() {
  return <span style={{ fontSize: 10, color: "#B8AC91", whiteSpace: "nowrap" }}>自動同步</span>;
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
