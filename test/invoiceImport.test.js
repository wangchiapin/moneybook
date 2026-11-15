import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseChtInvoice, maskMatches, invoiceItemName } from "../src/invoiceImport.js";

const sample = readFileSync(new URL("./fixtures/cht-invoice-sample.htm", import.meta.url));

test("中華電信電子發票：讀出日期、金額、發票號碼、品名、帳單月份", () => {
  const r = parseChtInvoice(sample);
  assert.equal(r.ok, true);
  assert.equal(r.invoiceNo, "ES22192097");
  assert.equal(r.date, "2026-10-27");
  assert.equal(r.total, 199);
  assert.equal(r.randomCode, "9811");
  assert.equal(r.itemName, "行動月租費");
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.items[0], { name: "行動月租費", qty: 1, unit: 199, amount: 199 });
  assert.equal(r.phoneMasked, "0988*1*9*9");
  assert.equal(r.billMonthLabel, "115年10月帳");
  assert.deepEqual(r.warnings, []);
});

test("不是中華電信的檔案：不讀，回傳說明", () => {
  const r = parseChtInvoice(readFileSync(new URL("./fixtures/other.htm", import.meta.url)));
  assert.equal(r.ok, false);
  assert.match(r.error, /認不出/);
  assert.match(r.error, /中華電信/);
});

test("壞掉的檔案不會丟例外", () => {
  assert.equal(parseChtInvoice(new Uint8Array([0, 1, 2, 3])).ok, false);
  assert.equal(parseChtInvoice(new Uint8Array([])).ok, false);
});

test("品項加起來和總計不一樣時，會有提醒", () => {
  const html = new TextDecoder("big5").decode(sample).replace(/(總計：<\/td><td[^>]*><font[^>]*>\s*)199/, "$1250");
  // 用 UTF-8 重新包裝（檔案裡也接受 UTF-8）
  const r = parseChtInvoice(new TextEncoder().encode(html));
  assert.equal(r.ok, true);
  assert.equal(r.total, 250);
  assert.equal(r.warnings.length, 1);
});

test("遮蔽號碼對完整號碼", () => {
  assert.equal(maskMatches("0988*1*9*9", "0988212949"), true);
  assert.equal(maskMatches("0988*1*9*9", "0988212948"), false); // 最後一碼不同
  assert.equal(maskMatches("0988*1*9*9", "098821294"), false);   // 長度不同
  assert.equal(maskMatches("0988*1*9*9", "09882129ab"), false);
  assert.equal(maskMatches("", "0988212949"), false);
});

test("項目名稱：電話費＋號碼", () => {
  const r = parseChtInvoice(sample);
  assert.equal(invoiceItemName(r, "0988212949"), "電話費0988212949");
  assert.equal(invoiceItemName(r, ""), "電話費0988*1*9*9");
});
