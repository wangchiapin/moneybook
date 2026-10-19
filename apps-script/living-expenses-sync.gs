// ===== 設定區：你的 Google Sheet ID =====
const LIVING_SHEET_ID = '1-P07_oyR1q9p4x3PifNtRYzHIjOVKxRtlssJfy1rfTc';

// ===== 小工具：從 Firestore 欄位取值 =====
function fsStr(f) { return f && f.stringValue !== undefined ? f.stringValue : ''; }
function fsNum(f) { return f ? Number(f.integerValue || f.doubleValue || 0) : 0; }

// ===== 讀「每月一份」的支出：ledgers/{uid}/months/{YYYY-MM} =====
function readMonthExpenses(base, token) {
  const rows = [];
  let pageToken = '';
  do {
    const url = base + '/months?pageSize=100' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      throw new Error('讀取 months 失敗：' + res.getResponseCode() + ' ' + res.getContentText());
    }
    const data = JSON.parse(res.getContentText());
    (data.documents || []).forEach(d => {
      const monthId = d.name.split('/').pop();
      if (!/^\d{4}-\d{2}$/.test(monthId)) return;          // 跳過備份文件（_backup_legacy_…）
      const items = d.fields && d.fields.items && d.fields.items.mapValue && d.fields.items.mapValue.fields;
      if (!items) return;
      Object.keys(items).forEach(id => {
        const f = items[id].mapValue && items[id].mapValue.fields;
        if (!f) return;
        rows.push([fsStr(f.date), fsStr(f.category), fsStr(f.item), fsNum(f.price), fsStr(f.note)]);
      });
    });
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));   // 依日期排序
  return rows;
}

// ===== 主要同步函式 =====
function syncLivingExpenses() {
  const token = getAccessToken();

  const projectId = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID');
  const uid = PropertiesService.getScriptProperties().getProperty('MONEYBOOK_UID');
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/ledgers/${uid}`;

  const res = UrlFetchApp.fetch(base, { headers: { Authorization: 'Bearer ' + token } });
  const doc = JSON.parse(res.getContentText());
  const ss = SpreadsheetApp.openById(LIVING_SHEET_ID);

  // ---- 支出：新格式（每月一份）；還沒搬家時退回讀舊的整包陣列 ----
  let expenseRows = readMonthExpenses(base, token);
  if (expenseRows.length === 0) {
    const legacy = (doc.fields && doc.fields.expenses && doc.fields.expenses.arrayValue.values) || [];
    expenseRows = legacy.map(item => {
      const f = item.mapValue.fields;
      return [fsStr(f.date), fsStr(f.category), fsStr(f.item), fsNum(f.price), fsStr(f.note)];
    });
  }

  const expenseSheet = ss.getSheetByName('支出');
  if (expenseRows.length > 0) {
    expenseSheet.clearContents();
    expenseSheet.appendRow(['日期', '分類', '項目', '金額', '備註']);
    expenseSheet.getRange(2, 1, expenseRows.length, 5).setValues(expenseRows);
  } else {
    Logger.log('⚠️ 讀到 0 筆支出，為了避免清空試算表，這次沒有更新「支出」分頁');
  }

  // ---- 收入（維持放在主文件，沒有變）----
  const incomesRaw = (doc.fields && doc.fields.incomes && doc.fields.incomes.arrayValue.values) || [];
  const incomeRows = incomesRaw.map(item => {
    const f = item.mapValue.fields;
    return [fsStr(f.month), fsStr(f.source), fsNum(f.amount)];
  });
  const incomeSheet = ss.getSheetByName('收入');
  incomeSheet.clearContents();
  incomeSheet.appendRow(['月份', '來源', '金額']);
  if (incomeRows.length > 0) {
    incomeSheet.getRange(2, 1, incomeRows.length, 3).setValues(incomeRows);
  }

  Logger.log('同步完成：支出 ' + expenseRows.length + ' 筆，收入 ' + incomeRows.length + ' 筆');
}

// ===== 取得存取權杖（沒有改）=====
function getAccessToken() {
  const props = PropertiesService.getScriptProperties();
  const rawKey = props.getProperty('FIREBASE_PRIVATE_KEY');
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const service = OAuth2.createService('Firestore')
    .setTokenUrl('https://oauth2.googleapis.com/token')
    .setPrivateKey(privateKey)
    .setIssuer(props.getProperty('FIREBASE_CLIENT_EMAIL'))
    .setPropertyStore(props)
    .setScope('https://www.googleapis.com/auth/datastore');

  service.reset();

  if (!service.hasAccess()) {
    Logger.log('詳細錯誤：' + service.getLastError());
  }
  return service.getAccessToken();
}
