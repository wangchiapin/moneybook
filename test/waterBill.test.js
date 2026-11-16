import test from "node:test";
import assert from "node:assert/strict";
import { parseTwWaterText } from "../src/waterBill.js";
import { addMonths, buildReadings, mergeReadings, periodNote, removeReading } from "../src/utilityReadings.js";

// 照 115年9月收據整理（去掉姓名地址）
const RECEIPT = `台灣自來水股份有限公司 Taiwan Water Corporation 115 年 9 月轉帳代繳(代收)水費電子繳費憑證
站所 編號 檢號 本期計費用水期間 水費項目小計 197元
115/06/04 - 115/08/03 基本費 35.70元
用水種別 普通 用水費 165.90元
水表表號 113A127523 電子帳單回饋金 -5.00元
本期水費扣繳日 115/09/08
單據號碼 0309391239
本期實用度數 22
代繳(代收) 總金額 405元
代徵費用小計 208元
本期 22 0.36
上期 21 0.33
去年同期 33 0.57
代繳(代收)總金額 405元`;

test("讀出水費收據", () => {
  const r = parseTwWaterText(RECEIPT);
  assert.equal(r.ok, true);
  assert.equal(r.date, "2026-09-08");
  assert.equal(r.amount, 405);
  assert.equal(r.docNo, "0309391239");
  assert.equal(r.periodStart, "2026-06-04");
  assert.equal(r.periodEnd, "2026-08-03");
  assert.equal(r.meterNo, "113A127523");
  assert.equal(r.usage, 22);
  assert.equal(r.usagePrev, 21);
  assert.equal(r.usageLastYear, 33);
  assert.deepEqual(r.warnings, []);
});
test("電子通知不收", () => {
  const r = parseTwWaterText("台灣自來水股份有限公司 115 年 11 月水費電子通知(金融機構代繳用戶) 單據號碼 0611247141 本期水費扣繳日 115/11/09");
  assert.equal(r.ok, false);
});
test("備註文字", () => {
  assert.equal(periodNote("2026-06-04", "2026-08-03", 22, "water"), "115年6～7月帳，用水 22 度");
  assert.equal(periodNote("2026-08-04", "2026-10-02", 14, "water"), "115年8～9月帳，用水 14 度");
});
test("推算上期、去年同期的期間", () => {
  assert.equal(addMonths("2026-06-04", -2), "2026-04-04");
  assert.equal(addMonths("2026-08-03", -12), "2025-08-03");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
});
let n = 0; const gid = () => "id" + ++n;
test("一份帳單建三筆；真正的帳單會取代參考值，參考值不會蓋掉真正的帳單", () => {
  const r = parseTwWaterText(RECEIPT);
  const first = mergeReadings([], buildReadings(r, gid));
  assert.equal(first.length, 3);
  assert.equal(first.filter((x) => x.source === "ref").length, 2);
  // 之後匯入 4~6 月那一期的真正帳單，應該取代 ref
  const real = { kind: "water", meterNo: "113A127523", periodStart: "2026-04-04", periodEnd: "2026-06-03", usage: 21, dailyAvg: 0.34, docNo: "X", amount: 380 };
  const second = mergeReadings(first, buildReadings(real, gid));
  const apr = second.filter((x) => x.periodStart === "2026-04-04");
  assert.equal(apr.length, 1);
  assert.equal(apr[0].source, "bill");
  assert.equal(apr[0].dailyAvg, 0.34);
  // 重複匯入同一份，不會多出來
  assert.equal(mergeReadings(second, buildReadings(r, gid)).length, second.length);
  // 參考值不會蓋掉真正的
  const refAgain = mergeReadings(second, [{ ...apr[0], source: "ref", usage: 99 }]);
  assert.equal(refAgain.find((x) => x.periodStart === "2026-04-04").usage, 21);
  assert.equal(removeReading(second, second[0].id).length, second.length - 1);
});
