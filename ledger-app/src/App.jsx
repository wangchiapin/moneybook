import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, ChevronLeft, ChevronRight, X, Trash2,
  BarChart3, BookText, PiggyBank, Pencil, Check, LogOut
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut,
} from "firebase/auth";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";

// ---------- constants ----------

const CATEGORIES = [
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
const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const INCOME_SOURCES = ["華語文教學", "股票投資", "交割折讓"];

const INK = "#2B2620";
const PAPER = "#F6F1E6";
const PAPER_DEEP = "#EDE4D0";
const STAMP = "#A3352A";
const GOOD = "#3F7D5C";

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKeyOf = (iso) => iso.slice(0, 7);
const twYear = (yyyy) => Number(yyyy) - 1911;
const fmt = (n) => Math.round(n || 0).toLocaleString("zh-Hant-TW");
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
function dateLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))} (${WEEKDAYS[d.getDay()]})`;
}
function monthLabel(mk) {
  const [y, m] = mk.split("-");
  return { tw: `民國 ${twYear(y)} 年 ${Number(m)} 月`, greg: `${y} · ${Number(m)}月` };
}
function shiftMonth(mk, delta) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------- small UI atoms ----------

function CatDot({ color, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}

function StampBadge({ value, size = 108 }) {
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

// ---------- login screen ----------

function LoginScreen() {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans TC', sans-serif", padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@700;900&family=Noto+Sans+TC:wght@400;500;700&display=swap');`}</style>
      <form onSubmit={submit} style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 360, border: "1px solid #ECE1C9" }}>
        <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 22, fontWeight: 900, margin: "0 0 4px", color: INK }}>生活帳本</h1>
        <p style={{ fontSize: 12, color: "#8A8072", margin: "0 0 20px" }}>{mode === "signin" ? "登入你的帳本" : "建立你的帳本帳號（僅需一次）"}</p>
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E0D5BC", borderRadius: 12, padding: "11px 12px", fontSize: 14, marginBottom: 10 }} />
        <input type="password" required placeholder="密碼（至少 6 碼）" value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E0D5BC", borderRadius: 12, padding: "11px 12px", fontSize: 14, marginBottom: 14 }} />
        {error && <div style={{ color: STAMP, fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={busy} style={{ width: "100%", padding: "12px 0", borderRadius: 14, border: "none", background: STAMP, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          {busy ? "處理中…" : mode === "signin" ? "登入" : "建立帳號"}
        </button>
        <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          style={{ width: "100%", background: "none", border: "none", color: "#8A8072", fontSize: 12, marginTop: 12, cursor: "pointer" }}>
          {mode === "signin" ? "第一次使用？建立帳號" : "已經有帳號？登入"}
        </button>
      </form>
    </div>
  );
}

// ---------- main app ----------

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [viewMonth, setViewMonth] = useState(monthKeyOf(todayISO()));
  const [tab, setTab] = useState("ledger");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingIncomeSrc, setEditingIncomeSrc] = useState(null);
  const [incomeDraft, setIncomeDraft] = useState("");
  const [saveError, setSaveError] = useState(false);
  const initializedMonth = useRef(false);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  // ---- live sync from Firestore ----
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "ledgers", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() || {};
        setExpenses(data.expenses || []);
        setIncomes(data.incomes || []);
        if (!initializedMonth.current && (data.expenses || []).length) {
          const dates = data.expenses.map((e) => e.date).sort();
          setViewMonth(monthKeyOf(dates[dates.length - 1]));
          initializedMonth.current = true;
        }
        setDataLoaded(true);
      },
      () => setSaveError(true)
    );
    return unsub;
  }, [user]);

  const persist = useCallback(async (nextExpenses, nextIncomes) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "ledgers", user.uid), {
        expenses: nextExpenses, incomes: nextIncomes, updatedAt: Date.now(),
      });
    } catch (e) {
      setSaveError(true);
    }
  }, [user]);

  const addExpense = (entry) => {
    const next = [...expenses, { id: genId(), ...entry }];
    setExpenses(next);
    persist(next, incomes);
    setShowAdd(false);
  };
  const deleteExpense = (id) => {
    const next = expenses.filter((e) => e.id !== id);
    setExpenses(next);
    persist(next, incomes);
    setConfirmDeleteId(null);
  };
  const getIncomeAmount = (month, source) =>
    incomes.find((i) => i.month === month && i.source === source)?.amount || 0;
  const saveIncome = (month, source, amount) => {
    const others = incomes.filter((i) => !(i.month === month && i.source === source));
    const next = amount > 0 ? [...others, { id: genId(), month, source, amount }] : others;
    setIncomes(next);
    persist(expenses, next);
    setEditingIncomeSrc(null);
  };

  const statsFor = (month) => {
    const monthExp = expenses.filter((e) => monthKeyOf(e.date) === month);
    const categoryTotals = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
    let total = 0;
    monthExp.forEach((e) => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + Number(e.price || 0);
      total += Number(e.price || 0);
    });
    const cardFee = categoryTotals["卡費"] || 0;
    const netExpense = total - cardFee;
    const incomeTotal = INCOME_SOURCES.reduce((s, src) => s + getIncomeAmount(month, src), 0);
    const balance = incomeTotal - netExpense;
    return { categoryTotals, total, cardFee, netExpense, incomeTotal, balance };
  };

  const monthStats = useMemo(() => statsFor(viewMonth), [expenses, incomes, viewMonth]);

  const monthGroups = useMemo(() => {
    const monthExp = expenses.filter((e) => monthKeyOf(e.date) === viewMonth);
    const byDate = {};
    monthExp.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    const dates = Object.keys(byDate).sort().reverse();
    return dates.map((d) => ({
      date: d,
      items: byDate[d].sort((a, b) => b.id.localeCompare(a.id)),
      subtotal: byDate[d].reduce((s, e) => s + Number(e.price || 0), 0),
    }));
  }, [expenses, viewMonth]);

  const allMonths = useMemo(() => {
    const set = new Set(expenses.map((e) => monthKeyOf(e.date)));
    incomes.forEach((i) => set.add(i.month));
    set.add(viewMonth);
    return Array.from(set).sort();
  }, [expenses, incomes, viewMonth]);

  const yearGroups = useMemo(() => {
    const byYear = {};
    allMonths.forEach((mk) => {
      const y = twYear(mk.split("-")[0]);
      (byYear[y] = byYear[y] || []).push(mk);
    });
    return Object.keys(byYear).sort((a, b) => a - b).map((y) => ({
      year: y,
      months: byYear[y].sort(),
    }));
  }, [allMonths]);

  const chartData = useMemo(
    () => allMonths.slice(-6).map((mk) => ({
      name: `${Number(mk.split("-")[1])}月`,
      支出: statsFor(mk).netExpense,
      收入: statsFor(mk).incomeTotal,
    })),
    [allMonths, expenses, incomes]
  );

  if (user === undefined) {
    return <div style={{ minHeight: "100vh", background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", color: INK }}>載入中…</div>;
  }
  if (user === null) {
    return <LoginScreen />;
  }
  if (!dataLoaded) {
    return <div style={{ minHeight: "100vh", background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", color: INK }}>載入帳本中…</div>;
  }

  const { tw, greg } = monthLabel(viewMonth);

  return (
    <div style={{ minHeight: "100vh", background: PAPER, color: INK, fontFamily: "'Noto Sans TC', sans-serif", paddingBottom: 96 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700;900&family=Noto+Sans+TC:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        .lg-scroll::-webkit-scrollbar { height: 6px; }
        .lg-scroll::-webkit-scrollbar-thumb { background: #D8CBAE; border-radius: 4px; }
        button { font-family: inherit; }
        input, select { font-family: inherit; }
      `}</style>

      <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: 1 }}>
              生活帳本
            </h1>
            <p style={{ fontSize: 12, color: "#8A8072", margin: "2px 0 0" }}>{user.email}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StampBadge value={monthStats.balance} size={86} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button onClick={() => signOut(auth)} style={{ background: "none", border: "none", color: "#B8AC91", fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <LogOut size={13} /> 登出
          </button>
        </div>

        {saveError && (
          <div style={{ background: "#F7E3D9", border: "1px solid #E0B49A", borderRadius: 10, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
            雲端同步時發生問題，請確認網路連線或 Firebase 設定。
          </div>
        )}

        <div style={{ background: PAPER_DEEP, borderRadius: 16, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button onClick={() => setViewMonth((m) => shiftMonth(m, -1))} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: INK }}>
            <ChevronLeft size={20} />
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Noto Serif TC', serif", fontWeight: 700, fontSize: 16 }}>{tw}</div>
            <div style={{ fontSize: 11, color: "#8A8072", fontFamily: "'JetBrains Mono', monospace" }}>{greg}</div>
          </div>
          <button onClick={() => setViewMonth((m) => shiftMonth(m, 1))} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: INK }}>
            <ChevronRight size={20} />
          </button>
        </div>

        <div style={{ display: "flex", background: PAPER_DEEP, borderRadius: 999, padding: 4, marginBottom: 16, gap: 4 }}>
          {[["ledger", "記帳", BookText], ["stats", "統計", BarChart3]].map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, border: "none", cursor: "pointer", padding: "9px 0", borderRadius: 999,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: tab === key ? "#FFFFFF" : "transparent",
                color: tab === key ? STAMP : "#8A8072",
                fontWeight: tab === key ? 700 : 500, fontSize: 13,
                boxShadow: tab === key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all .15s",
              }}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {tab === "ledger" ? (
          <LedgerTab
            monthStats={monthStats}
            monthGroups={monthGroups}
            viewMonth={viewMonth}
            confirmDeleteId={confirmDeleteId}
            setConfirmDeleteId={setConfirmDeleteId}
            deleteExpense={deleteExpense}
            editingIncomeSrc={editingIncomeSrc}
            setEditingIncomeSrc={setEditingIncomeSrc}
            incomeDraft={incomeDraft}
            setIncomeDraft={setIncomeDraft}
            getIncomeAmount={getIncomeAmount}
            saveIncome={saveIncome}
          />
        ) : (
          <StatsTab yearGroups={yearGroups} statsFor={statsFor} chartData={chartData} viewMonth={viewMonth} setViewMonth={setViewMonth} setTab={setTab} />
        )}
      </div>

      {tab === "ledger" && (
        <button
          onClick={() => setShowAdd(true)}
          aria-label="新增支出"
          style={{
            position: "fixed", bottom: 24, right: "50%", transform: "translateX(190px)",
            width: 56, height: 56, borderRadius: "50%", background: STAMP, color: "#fff",
            border: "none", boxShadow: "0 6px 16px rgba(163,53,42,0.4)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20,
          }}
        >
          <Plus size={26} />
        </button>
      )}

      {showAdd && (
        <AddExpenseSheet viewMonth={viewMonth} onClose={() => setShowAdd(false)} onSubmit={addExpense} />
      )}
    </div>
  );
}

// ---------- ledger tab ----------

function LedgerTab({
  monthStats, monthGroups, viewMonth,
  confirmDeleteId, setConfirmDeleteId, deleteExpense,
  editingIncomeSrc, setEditingIncomeSrc, incomeDraft, setIncomeDraft,
  getIncomeAmount, saveIncome,
}) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <Tile label="支出總計" value={monthStats.total} color={INK} />
        <Tile label="扣卡費" value={monthStats.netExpense} color={INK} />
        <Tile label="收入合計" value={monthStats.incomeTotal} color={GOOD} />
      </div>

      <div style={{ marginBottom: 18 }}>
        {monthGroups.length === 0 && (
          <div style={{ textAlign: "center", padding: "36px 0", color: "#A79C89", fontSize: 13 }}>
            本月尚無紀錄，點右下角「＋」開始記帳
          </div>
        )}
        {monthGroups.map((g) => (
          <div key={g.date} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 2px 6px", borderBottom: `1px solid #E0D5BC` }}>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Noto Serif TC', serif" }}>{dateLabel(g.date)}</span>
              <span style={{ fontSize: 12, color: "#8A8072", fontFamily: "'JetBrains Mono', monospace" }}>小計 ${fmt(g.subtotal)}</span>
            </div>
            {g.items.map((it) => {
              const cat = CAT_MAP[it.category] || { name: it.category, color: "#999" };
              const confirming = confirmDeleteId === it.id;
              return (
                <div
                  key={it.id}
                  onClick={() => setConfirmDeleteId(confirming ? null : it.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderBottom: "1px solid #EFE7D4", cursor: "pointer" }}
                >
                  <CatDot color={cat.color} size={9} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.item || cat.name}</div>
                    <div style={{ fontSize: 11, color: "#A79C89" }}>{cat.name}{it.note ? ` · ${it.note}` : ""}</div>
                  </div>
                  {confirming ? (
                    <button onClick={(e) => { e.stopPropagation(); deleteExpense(it.id); }}
                      style={{ background: STAMP, color: "#fff", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                      <Trash2 size={13} /> 刪除
                    </button>
                  ) : (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600 }}>${fmt(it.price)}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 14, marginBottom: 14, border: "1px solid #ECE1C9" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#8A8072", marginBottom: 10, letterSpacing: 1 }}>分類明細</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
          {CATEGORIES.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#5C5343" }}>
                <CatDot color={c.color} /> {c.name}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: monthStats.categoryTotals[c.id] ? INK : "#C9BFA9" }}>
                {fmt(monthStats.categoryTotals[c.id])}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 14, border: "1px solid #ECE1C9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#8A8072", marginBottom: 10, letterSpacing: 1 }}>
          <PiggyBank size={14} /> 本月收入
        </div>
        {INCOME_SOURCES.map((src) => {
          const amount = getIncomeAmount(viewMonth, src);
          const editing = editingIncomeSrc === src;
          return (
            <div key={src} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", fontSize: 13, borderBottom: "1px solid #F3ECDA" }}>
              <span style={{ color: "#5C5343" }}>{src}</span>
              {editing ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number" autoFocus defaultValue={amount || ""}
                    onChange={(e) => setIncomeDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveIncome(viewMonth, src, Number(incomeDraft || 0)); }}
                    style={{ width: 90, border: "1px solid #D8CBAE", borderRadius: 8, padding: "4px 8px", fontSize: 13, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <button onClick={() => saveIncome(viewMonth, src, Number(incomeDraft || 0))} style={{ background: GOOD, border: "none", color: "#fff", borderRadius: 6, padding: 5, cursor: "pointer" }}>
                    <Check size={13} />
                  </button>
                </div>
              ) : (
                <button onClick={() => { setEditingIncomeSrc(src); setIncomeDraft(String(amount || "")); }}
                  style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: INK, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                  ${fmt(amount)} <Pencil size={11} color="#B8AC91" />
                </button>
              )}
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 13, fontWeight: 700 }}>
          <span>共計</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: GOOD }}>${fmt(monthStats.incomeTotal)}</span>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, color }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "12px 8px", textAlign: "center", border: "1px solid #ECE1C9" }}>
      <div style={{ fontSize: 11, color: "#A79C89", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, color }}>${fmt(value)}</div>
    </div>
  );
}

// ---------- add expense bottom sheet ----------

function AddExpenseSheet({ viewMonth, onClose, onSubmit }) {
  const [date, setDate] = useState(() => {
    const t = todayISO();
    return monthKeyOf(t) === viewMonth ? t : `${viewMonth}-01`;
  });
  const [category, setCategory] = useState("食");
  const [item, setItem] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");

  const canSubmit = price !== "" && Number(price) > 0;
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
          {CATEGORIES.map((c) => (
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

const fieldLabel = { display: "block", fontSize: 11.5, color: "#8A8072", fontWeight: 700, letterSpacing: 0.5, margin: "0 2px 6px" };
const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid #E0D5BC", borderRadius: 12, padding: "10px 12px", fontSize: 14, marginBottom: 14, background: "#fff", color: INK };

// ---------- stats tab ----------

function StatsTab({ yearGroups, statsFor, chartData, viewMonth, setViewMonth, setTab }) {
  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 16, padding: 14, border: "1px solid #ECE1C9", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#8A8072", marginBottom: 8, letterSpacing: 1 }}>近半年收支</div>
        <div style={{ width: "100%", height: 160 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#EFE7D4" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8A8072" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#8A8072" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #ECE1C9" }} formatter={(v) => `$${fmt(v)}`} />
              <Bar dataKey="支出" fill={STAMP} radius={[4, 4, 0, 0]} />
              <Bar dataKey="收入" fill={GOOD} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #ECE1C9", overflow: "hidden" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#8A8072", padding: "12px 14px 6px", letterSpacing: 1 }}>逐月統計（比照原 Excel「統計」表）</div>
        <div className="lg-scroll" style={{ overflowX: "auto", padding: "0 4px 12px" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11.5, minWidth: 720 }}>
            <thead>
              <tr>
                <th style={thStyle}>月份</th>
                {CATEGORIES.map((c) => (<th key={c.id} style={{ ...thStyle, color: c.color }}>{c.id}</th>))}
                <th style={thStyle}>總計</th>
                <th style={thStyle}>扣卡費</th>
                <th style={thStyle}>收入</th>
                <th style={thStyle}>收支損益</th>
              </tr>
            </thead>
            <tbody>
              {yearGroups.map((yg) => (
                <React.Fragment key={yg.year}>
                  {yg.months.map((mk) => {
                    const s = statsFor(mk);
                    const active = mk === viewMonth;
                    return (
                      <tr key={mk} onClick={() => { setViewMonth(mk); setTab("ledger"); }} style={{ cursor: "pointer", background: active ? "#FBF3E4" : "transparent" }}>
                        <td style={{ ...tdStyle, fontWeight: 700, position: "sticky", left: 0, background: active ? "#FBF3E4" : "#fff" }}>{Number(mk.split("-")[1])}月</td>
                        {CATEGORIES.map((c) => (<td key={c.id} style={tdStyle}>{s.categoryTotals[c.id] ? fmt(s.categoryTotals[c.id]) : "－"}</td>))}
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{fmt(s.total)}</td>
                        <td style={tdStyle}>{fmt(s.netExpense)}</td>
                        <td style={{ ...tdStyle, color: GOOD }}>{s.incomeTotal ? fmt(s.incomeTotal) : "－"}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: s.balance >= 0 ? GOOD : STAMP }}>{s.balance >= 0 ? "+" : ""}{fmt(s.balance)}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: PAPER_DEEP }}>
                    <td style={{ ...tdStyle, fontWeight: 800, position: "sticky", left: 0, background: PAPER_DEEP }}>{yg.year}年</td>
                    {CATEGORIES.map((c) => {
                      const sum = yg.months.reduce((s, mk) => s + statsFor(mk).categoryTotals[c.id], 0);
                      return <td key={c.id} style={{ ...tdStyle, fontWeight: 700 }}>{sum ? fmt(sum) : "－"}</td>;
                    })}
                    {(() => {
                      const totals = yg.months.reduce((acc, mk) => {
                        const s = statsFor(mk);
                        acc.total += s.total; acc.net += s.netExpense; acc.inc += s.incomeTotal; acc.bal += s.balance;
                        return acc;
                      }, { total: 0, net: 0, inc: 0, bal: 0 });
                      return (
                        <>
                          <td style={{ ...tdStyle, fontWeight: 800 }}>{fmt(totals.total)}</td>
                          <td style={{ ...tdStyle, fontWeight: 800 }}>{fmt(totals.net)}</td>
                          <td style={{ ...tdStyle, fontWeight: 800, color: GOOD }}>{fmt(totals.inc)}</td>
                          <td style={{ ...tdStyle, fontWeight: 800, color: totals.bal >= 0 ? GOOD : STAMP }}>{totals.bal >= 0 ? "+" : ""}{fmt(totals.bal)}</td>
                        </>
                      );
                    })()}
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const thStyle = { padding: "6px 8px", textAlign: "right", color: "#8A8072", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid #ECE1C9" };
const tdStyle = { padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid #F3ECDA", fontFamily: "'JetBrains Mono', monospace" };
