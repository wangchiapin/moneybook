# 生活帳本

> Excel 風格的記帳網頁，資料同步 Firestore，電腦與手機共用

- **網址：** https://wangchiapin.github.io/moneybook/
- **Firebase 專案：** moneybook-50481
- **登入方式：** Email / 密碼
- **狀態：** 使用中
- **備註：** React + Vite，以 GitHub Actions 部署。同專案的其他 repo：`All-MoneyBook`、`cadadiaunosminutos`、`travelaccount`。

---

# 生活帳本

依你原本 Excel 記帳表格式做的網頁記帳工具，資料存在 Firebase Firestore，電腦、手機都能開，登入同一個帳號資料就會同步。

## 目前的功能與資料放哪裡

- 分頁：記帳（逐月支出、收入、月備註）、統計、圖表、搜尋；另有「隨手記」快速輸入、「記一筆」可用發票照片辨識（Gemini，金鑰在設定裡的「發票辨識」）、設定（分類、收入來源、匯入匯出、統計頁密碼）。
- 資料放在 Firestore：
  - **支出**：`ledgers/{uid}/months/{YYYY-MM}`，**每個月一份文件，月內每一筆各占一格**（`items.<支出編號>`）。新增／修改／刪除只動那一筆那一格，不會整份覆蓋，所以**離線也能記帳**（連上網路後自動送出），兩台裝置同時記也不會互相蓋掉。
  - **其他**（收入、分類、收入來源、月備註、設定…）：還是在 `ledgers/{uid}` 這一份主文件。收入維持原樣，教學 App 的收入同步沒有動。
  - **舊資料搬家**：第一次用新版登入時，若主文件裡還有舊的 `expenses` 陣列，會自動：先把整份舊資料備份成 `months/_backup_legacy_<時間>` → 搬到各月份 → 從伺服器重讀核對每一筆都在 → 才刪掉主文件裡的舊陣列。任何一步失敗都不會刪東西，畫面會顯示可重試。備份文件留在雲端，確認沒問題後可以自行刪除。
  - 這需要 Firebase 規則開放 `ledgers/{uid}/months/{month}`（見根目錄 `moneybook-50481.rules.txt`）。
- **新增支出的常用提示：** 在「記一筆」點項目欄會列出常用項目，點金額欄會列出常用金額（依過去的支出統計，次數多的在前、次數一樣就最近用過的在前）；點項目會自動帶入它最常用的分類並跳到金額欄。只在「新增」時出現。
- 「華語文教學」這個收入來源是從教學紀錄 App 自動同步進來的，這裡只能看、不能改。

## 一、設定 Firebase（想用自己的專案時才需要，約 5 分鐘）

> 這個 repo 目前已經接在 `moneybook-50481` 專案上，`src/firebase.js` 裡的設定是填好的，**平常不用做這一節**。

1. 到 [Firebase Console](https://console.firebase.google.com/) 建立一個新專案。
2. 左側選單「Build → Authentication」→「Get started」→ 啟用「Email/Password」登入方式。
3. 左側選單「Build → Firestore Database」→「Create database」→ 選 production mode，地區選 asia-east1（或任一）。
4. 建立好之後，點左側「Firestore Database → 規則」，貼上規則後按發布。
   - ⚠️ **本專案根目錄的 `moneybook-50481.rules.txt` 是 `moneybook-50481` 專案「完整」的規則**，這個專案同時給生活帳本、財務資產 All-MoneyBook、華語課表／收入、旅費帳本使用，而 Firebase 一個專案只有一份規則。所以要發布就貼**整份**，不能只貼其中一段，否則其他網站會被擋住。
   - 如果是全新的專案，只需要保留 `ledgers/{uid}` 和 `ledgers/{uid}/months/{month}` 這兩段。
5. 左側選單「專案設定」（齒輪圖示）→ 往下捲到「我的應用程式」→ 點 網頁圖示 `</>` 新增一個網頁應用程式 → 註冊後會看到一段 `firebaseConfig`。
6. 把那段設定值貼到 `src/firebase.js` 裡，取代原本的設定。

## 二、上傳到 GitHub

```bash
cd moneybook
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/你的帳號/你的repo名稱.git
git push -u origin main
```

## 三、開啟 GitHub Pages

1. 打開你 GitHub 上的 repo → Settings → Pages。
2. 「Build and deployment → Source」選 **GitHub Actions**。
3. 打開 `vite.config.js`，確認 `base` 跟 repo 名稱完全一致（這個 repo 叫 `moneybook`，所以是 `base: "/moneybook/"`；換了 repo 名稱就要跟著改），存檔後 commit + push。
4. push 到 `main` 分支後，repo 的 Actions 分頁會自動跑建置流程，跑完後網址會是：
   `https://你的帳號.github.io/你的repo名稱/`

之後每次 push 到 main，網站都會自動重新部署。

## 四、開始使用

1. 打開部署好的網址，第一次使用點「第一次使用？建立帳號」，用 email + 密碼建立一個帳號（這組帳密只有你自己用）。
2. 手機也打開同一個網址，用同一組帳密登入，資料就會跟電腦同步（Firestore 即時同步，兩邊都會自動更新）。
3. 可以把網頁加到手機主畫面（Safari／Chrome 選單裡的「加入主畫面」），開起來就像 App 一樣。

## 本機測試（選用）

```bash
npm install
npm run dev
```

## 檔案說明

- `src/App.jsx`：主要畫面與邏輯（也負責讀寫 Firestore）
- `src/lib.js`：金額、日期、統計、隨手記解析等共用計算
- `src/firebase.js`：Firebase 連線設定（目前是 `moneybook-50481`）
- `moneybook-50481.rules.txt`：`moneybook-50481` 專案的完整資料庫安全規則（多個網站共用，只允許登入者存取自己的資料）
- `apps-script/living-expenses-sync.gs`：把支出（每月一份）與收入同步到 Google 試算表的 Apps Script 腳本備份（`syncLivingExpenses`），要貼到 Apps Script 才會生效；用到的指令碼屬性與「改了哪些欄位就要同步改腳本」見 `apps-script/README.md`
- `.github/workflows/deploy.yml`：自動部署到 GitHub Pages 的流程
