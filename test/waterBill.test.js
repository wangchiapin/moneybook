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

import { parseTaipowerText, electricNote } from "../src/taipowerBill.js";
const POWER7 = `台灣電力公司 TAIWAN POWER COMPANY 台 灣 電 力 公 司 電子帳單清單式電費繳費憑證 日期：115/07/25
台電區域編號 NormBDSD1574876F444DC
收據號碼 E-116151390041150708
收費日/扣繳日 電號 代繳帳號 用戶統編 台電統編 計費期間 用電度數 電費金額 營業稅 應繳總金額
1150723 11615139004 9012612*8*8*9* 79634302 1150429-1150701 453 876
用電戶名：某某 用電地址：高雄市岡山區維仁路３０巷１８號一樓 輪流停電組別：D
本期發票資訊： 發票期別： 115年07-08月 發票號碼：DJ-29096088 金額(元)：876
前期發票資訊： 發票期別： 115年05-06月 發票號碼：BG-29125328 金額(元)：433
1150723 11615139208 9012612*8*8*9* 79634302 1150429-1150701 402 441
用電戶名：某某 用電地址：高雄市岡山區維仁路３０巷１８號二樓
本期發票資訊： 發票期別： 115年07-08月 發票號碼：DJ-29096089 金額(元)：441
前期發票資訊： 發票期別： 115年05-06月 發票號碼：BG-29125329 金額(元)：399
合計： 2戶 應繳金額： $1,317元 第 1頁 共 1頁 總計： 2戶 應繳金額： $1,317元`;
test("台電繳費憑證：兩戶各一筆", () => {
  const r = parseTaipowerText(POWER7);
  assert.equal(r.ok, true);
  assert.equal(r.accounts.length, 2);
  const [a, b] = r.accounts;
  assert.deepEqual([a.label, a.usage, a.amount, a.invoiceNo, a.date], ["一樓", 453, 876, "DJ29096088", "2026-07-23"]);
  assert.deepEqual([b.label, b.usage, b.amount, b.invoiceNo], ["二樓", 402, 441, "DJ29096089"]);
  assert.equal(a.periodStart, "2026-04-29");
  assert.equal(a.periodEnd, "2026-07-01");
  assert.equal(r.total, 1317);
  assert.deepEqual(r.warnings, []);
  assert.equal(electricNote(a.periodStart, a.periodEnd, a.usage, a.label), "115年4/29～7/1，用電 453 度（一樓）");
});
test("台電：金額加不起來會提醒；通知單不收", () => {
  assert.equal(parseTaipowerText(POWER7.replaceAll("1,317", "1,300")).warnings.length, 1);
  assert.equal(parseTaipowerText("台灣電力公司 電費通知單").ok, false);
});

test("電費：一戶一筆使用紀錄，沒有上期、去年同期的參考值", () => {
  const r = parseTaipowerText(POWER7);
  const a = r.accounts[0];
  const recs = buildReadings({ kind: "electric", meterNo: a.meterNo, periodStart: a.periodStart, periodEnd: a.periodEnd, usage: a.usage, dailyAvg: a.dailyAvg, docNo: a.invoiceNo, amount: a.amount }, gid);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].kind, "electric");
  assert.equal(recs[0].source, "bill");
  // 一樓、二樓是不同電號，不會互相覆蓋
  const b = r.accounts[1];
  const merged = mergeReadings(recs, buildReadings({ kind: "electric", meterNo: b.meterNo, periodStart: b.periodStart, periodEnd: b.periodEnd, usage: b.usage, docNo: b.invoiceNo, amount: b.amount }, gid));
  assert.equal(merged.length, 2);
});

test("台電：標題只有「台 灣 電 力 公 司」（字間有空白）、沒有連在一起的公司名也要讀得到", () => {
  const t = POWER7.replace("台灣電力公司 TAIWAN POWER COMPANY ", "").replace("台 灣 電 力 公 司", "台 灣 電 力 公 司");
  assert.equal(t.includes("台灣電力公司"), false);
  const r = parseTaipowerText(t);
  assert.equal(r.ok, true);
  assert.equal(r.accounts.length, 2);
});
