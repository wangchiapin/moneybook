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
test("金額對不起來會提醒", () => {
  const r = parseTwmBillText(SAMPLE.replace("本期新增 599", "本期新增 500"), "2026-11-16");
  assert.equal(r.warnings.length, 1);
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
