import test from "node:test";
import assert from "node:assert/strict";
import { parseTwmBillText, addPendingBill, removePendingBill } from "../src/pdfBill.js";

const SAMPLE = `台灣大哥大 電信帳單
門號 09852***91
帳單編號： A116398010268
列帳期間 10/04–11/03
前期應繳 599
繳款 -599
本期新增 599
本期應繳 599
繳款截止日 暫無需繳款併入次期
繳款方式 轉帳代繳（信用卡）`;

test("讀出台灣大哥大帳單", () => {
  const r = parseTwmBillText(SAMPLE, "2026-11-16");
  assert.equal(r.ok, true);
  assert.equal(r.billNo, "A116398010268");
  assert.equal(r.amount, 599);
  assert.equal(r.noPayNeeded, true);
  assert.equal(r.billMonthLabel, "115年11月帳單");
  assert.equal(r.phoneMasked, "09852***91");
  assert.deepEqual(r.warnings, []);
});
test("不是這種帳單", () => {
  assert.equal(parseTwmBillText("中華電信 發票", "2026-11-16").ok, false);
});
test("擋重複、可刪除", () => {
  let l = addPendingBill([], { id: "1", billNo: "A1" });
  l = addPendingBill(l, { id: "2", billNo: "A1" });
  assert.equal(l.length, 1);
  assert.equal(removePendingBill(l, "1").length, 0);
});

test("文字裡沒有「帳單編號」四個字時，也能從檔名或文字找到號碼", () => {
  const t = "台灣大哥大 電信帳單 09852***91 列帳期間 10/04–11/03 本期應繳 599 A116398010268";
  assert.equal(parseTwmBillText(t, "2026-11-16").billNo, "A116398010268");
  const t2 = "台灣大哥大 電信帳單 列帳期間 10/04–11/03 本期應繳 599";
  assert.equal(parseTwmBillText(t2, "2026-11-16", "我的帳單A116398010268.pdf").billNo, "A116398010268");
});

const SEP = `台灣大哥大 115年09月我的帳單 列帳期間: 115/08/04-115/09/03 電話號碼: 09852***91
各類帳單負數金額不互相抵扣 帳單類別 前期應繳 - 繳款金額 + 本期新增 = 本期應繳 應繳總額$ 繳款截止日 繳款方式
電信費 601 0 599 1,200 1,200 115/09/24 自行繳款
※ 【重要】轉帳代繳已終止授權，本期請以其他繳費方式繳款：次期起，若應繳金額少於1,000元，併於下期繳款
上期開立發票:115/07/25發票號碼 DB32324427 A751958208263`;
test("9月帳單：前期 601＋本期 599＝1,200，不會被說明文字的 1,000 騙到", () => {
  const r = parseTwmBillText(SEP, "2026-11-16", "我的帳單A751958208263.pdf");
  assert.equal(r.amount, 1200);
  assert.equal(r.billMonthLabel, "115年9月帳單");
  assert.equal(r.billNo, "A751958208263");
  assert.equal(r.dueDate, "115/09/24");
  assert.equal(r.payMethod, "自行繳款");
  assert.equal(r.warnings.length, 1);
});
test("數字列被拆開時，改用應繳總額", () => {
  const t = "台灣大哥大 帳單 應繳總額$ 1,200 繳款截止日 115/09/24 若應繳金額少於1,000元 A751958208263";
  assert.equal(parseTwmBillText(t, "2026-11-16").amount, 1200);
});

test("頁首的「-1 / 1  頁次 1 / 1」不會被當成金額", () => {
  const t = "台灣大哥大 -1 / 1 頁次 1 / 1 115年09月我的帳單 列帳期間: 115/08/04-115/09/03 電話號碼: 09852***91 帳單類別 前期應繳 - 繳款金額 + 本期新增 = 本期應繳 應繳總額$ 電信費 601 0 599 1,200 1,200 115/09/24 自行繳款 A751958208263";
  assert.equal(parseTwmBillText(t, "2026-11-16").amount, 1200);
  const t2 = "台灣大哥大 -1 / 1 頁次 1 / 1 本期應繳 應繳總額$ 1,200 A751958208263";
  assert.equal(parseTwmBillText(t2, "2026-11-16").amount, 1200);
});

test("收件匣分類：台灣大哥大帳單會進待扣款", async () => {
  const { classifyBillText } = await import("../src/billInbox.js");
  const c = classifyBillText(SAMPLE, "2026-11-16", "x.pdf");
  assert.equal(c.kind, "twm");
});
