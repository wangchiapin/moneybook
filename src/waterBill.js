// 台灣自來水公司「轉帳代繳水費電子繳費憑證（收據）」解析。
// 收據是扣款後才有的，日期和金額都是確定的，可以直接記帳。
// 「電子通知」（扣款前）金額和日期都是預計的，不收。
import { rocToIso, daysBetween } from "./utilityReadings.js";

export const WATER_SUPPORTED = "台灣自來水公司水費收據（PDF，扣款後的電子繳費憑證）";
export const DEFAULT_WATER_ITEM = "水費";

const toNum = (s) => Number(String(s).replace(/[,，\s]/g, ""));

export function parseTwWaterText(text) {
  const flat = String(text || "").replace(/\u3000/g, " ").replace(/\s+/g, " ");
  if (!/台灣自來水|Taiwan Water/i.test(flat)) return { ok: false, error: "認不出這份帳單。" };
  if (/水費電子通知/.test(flat) || !/水費電子繳費憑證|水費[^ ]{0,12}收據/.test(flat)) {
    return { ok: false, error: "這不是扣款後的收據。「電子通知」是扣款前寄的，金額和日期都是預計的，請匯入扣款後的收據（標題有「電子繳費憑證」或「收據」）。" };
  }

  const docNo = (flat.match(/單據號碼\s*(\d+)/) || [])[1] || "";
  if (!docNo) return { ok: false, error: "找不到單據號碼" };

  const dm = flat.match(/本期水費扣繳日\s*(\d{2,3})\/(\d{1,2})\/(\d{1,2})/);
  if (!dm) return { ok: false, error: "找不到「本期水費扣繳日」，這份可能不是扣款後的收據" };
  const date = rocToIso(dm[1], dm[2], dm[3]);

  const pm = flat.match(/(\d{2,3})\/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{2,3})\/(\d{1,2})\/(\d{1,2})/);
  if (!pm) return { ok: false, error: "找不到本期計費用水期間" };
  const periodStart = rocToIso(pm[1], pm[2], pm[3]);
  const periodEnd = rocToIso(pm[4], pm[5], pm[6]);

  const waterSub = (flat.match(/水費項目小計\s*([\d,]+)\s*元/) || [])[1];
  const levySub = (flat.match(/代徵費用小計\s*([\d,]+)\s*元/) || [])[1];
  const totals = [...flat.matchAll(/總金額\s*([\d,]+)\s*元/g)].map((m) => toNum(m[1]));
  let amount = totals.length ? totals[totals.length - 1] : null;
  const warnings = [];
  if (waterSub && levySub) {
    const sum = toNum(waterSub) + toNum(levySub);
    if (amount === null) amount = sum;
    else if (amount !== sum) warnings.push(`水費 ${waterSub} 元加代徵費用 ${levySub} 元是 ${sum} 元，和代繳總金額 ${amount} 元不一樣，請自己核對`);
  }
  if (amount === null || !Number.isFinite(amount)) return { ok: false, error: "找不到代繳總金額" };

  const meterNo = (flat.match(/水表表號\s*([A-Z0-9]+)/i) || [])[1] || "";
  const wn = flat.match(/水號\s*(\d+)\s+(\d+)\s+(\d+)/);
  const waterNo = wn ? `${wn[1]}-${wn[2]}-${wn[3]}` : "";

  const usage = toNum((flat.match(/本期實用度數\s*(\d+)/) || [])[1]);
  const rowCur = flat.match(/(?<![指針用])本期\s+(\d+)\s+([\d.]+)/);
  const rowPrev = flat.match(/上期\s+(\d+)\s+([\d.]+)/);
  const rowLast = flat.match(/去年同期\s+(\d+)\s+([\d.]+)/);
  const usageNow = Number.isFinite(usage) && usage >= 0 && /本期實用度數/.test(flat) ? usage : (rowCur ? toNum(rowCur[1]) : NaN);
  if (!Number.isFinite(usageNow)) return { ok: false, error: "找不到本期實用度數" };

  const days = daysBetween(periodStart, periodEnd);
  const dailyAvg = rowCur ? toNum(rowCur[2]) : Math.round((usageNow / days) * 100) / 100;
  if (rowCur && toNum(rowCur[1]) !== usageNow) warnings.push(`本期實用度數 ${usageNow} 和下方表格的 ${rowCur[1]} 不一樣，請自己核對`);
  if (Math.abs(usageNow / days - dailyAvg) > 0.02) warnings.push(`度數 ${usageNow} 除以 ${days} 天不等於帳單的日平均 ${dailyAvg}，請自己核對`);

  return {
    ok: true, kind: "water", docNo, date, amount, periodStart, periodEnd, meterNo, waterNo,
    usage: usageNow, dailyAvg,
    usagePrev: rowPrev ? toNum(rowPrev[1]) : NaN, dailyAvgPrev: rowPrev ? toNum(rowPrev[2]) : null,
    usageLastYear: rowLast ? toNum(rowLast[1]) : NaN, dailyAvgLastYear: rowLast ? toNum(rowLast[2]) : null,
    waterSub: waterSub ? toNum(waterSub) : null, levySub: levySub ? toNum(levySub) : null,
    warnings,
  };
}
