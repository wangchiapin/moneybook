import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseChtInvoice, findInvoiceName, setInvoiceName, removeInvoiceName, DEFAULT_PHONE_ITEM } from "../src/invoiceImport.js";

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

test("項目名稱：第一次沒有記住，記了之後同一支電話能找到", () => {
  const r = parseChtInvoice(sample);
  let list = [];
  assert.equal(findInvoiceName(list, r.phoneMasked), "");
  assert.equal(DEFAULT_PHONE_ITEM, "電話費");
  list = setInvoiceName(list, r.phoneMasked, " 電話費-0988 ");
  assert.deepEqual(list, [{ key: "0988*1*9*9", item: "電話費-0988" }]);
  assert.equal(findInvoiceName(list, "0988*1*9*9"), "電話費-0988");
  assert.equal(findInvoiceName(list, "0912*3*4*5"), ""); // 別支電話不會誤用
});

test("項目名稱：修改、刪除、空白不會存", () => {
  let list = setInvoiceName([], "0988*1*9*9", "電話費-0988");
  list = setInvoiceName(list, "0912*3*4*5", "電話費-0912");
  list = setInvoiceName(list, "0988*1*9*9", "手機月租");          // 改名：同一個 key 只留一筆
  assert.equal(list.length, 2);
  assert.equal(findInvoiceName(list, "0988*1*9*9"), "手機月租");
  assert.equal(findInvoiceName(list, "0912*3*4*5"), "電話費-0912");
  assert.equal(setInvoiceName(list, "0988*1*9*9", "   ").length, 1); // 改成空白＝不留
  assert.deepEqual(removeInvoiceName(list, "0988*1*9*9"), [{ key: "0912*3*4*5", item: "電話費-0912" }]);
  assert.deepEqual(removeInvoiceName(undefined, "x"), []);
  assert.equal(findInvoiceName(undefined, "x"), "");
});
