import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base 要跟 GitHub repo 名稱完全一致（網址是 https://帳號.github.io/repo名稱/）。
// 這個 repo 叫 moneybook，所以是 "/moneybook/"；如果改了 repo 名稱，這裡也要跟著改。
export default defineConfig({
  plugins: [react()],
  base: "/moneybook/",
});
