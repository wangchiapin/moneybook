# 生活帳本 → Google 試算表 同步腳本（Apps Script）

- 檔案：`living-expenses-sync.gs`（貼進 Google Apps Script 專案，函式 `syncLivingExpenses`）
- 讀的資料（Firebase 專案 `moneybook-50481`）：
  - 支出：`ledgers/{uid}/months/{YYYY-MM}`（每月一份，`items.<編號>`）；還沒搬家時退回讀 `ledgers/{uid}` 的舊 `expenses` 陣列
  - 收入：`ledgers/{uid}` 主文件的 `incomes`
- 指令碼屬性（不放在程式碼裡）：`FIREBASE_PROJECT_ID`、`MONEYBOOK_UID`、`FIREBASE_PRIVATE_KEY`、`FIREBASE_CLIENT_EMAIL`；需要 OAuth2 程式庫
- 保護：讀到 0 筆支出時不會清空試算表的「支出」分頁

## ⚠️ 改了下面這些，就要同步改這支腳本（並提醒 Ben 重新貼到 Apps Script）
- 支出存放位置或欄位（`date`／`category`／`item`／`price`／`note`）
- 收入存放位置或欄位（`month`／`source`／`amount`）
- Firestore 集合名稱或路徑
