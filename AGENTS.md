# AGENTS.md：我的 AI 工作流

> 這是「你自己的 AI 工作流」的家。agy 與 Codex 啟動時會自動讀這個檔案，Claude Code 透過 `CLAUDE.md` 讀到它。
> 課程進行中你會不斷修改它，從 M0 開始，它就是你建構自己工作流的具體產出，學期結束時，這個檔案就是你帶得走的工作方法。

## 關於我（M0 填好）

- 名字／暱稱：（填入）
- 我的背景：科技藝術大二，零程式基礎，正在修「物件導向程式設計」
- 我想做的創作方向：（隨學期更新）

## 回應規則

- 一律用繁體中文（台灣）回答
- 我是初學者：解釋程式時逐段講，不要一次倒一大坨

## 課堂 AI 公約（本課規則，不可刪改）

1. **研究先行**：我要做新東西時，先幫我做深度研究，比較做法與工具，**開源穩定熱門者優先**，列出取捨並附來源連結。你的整理只是路標，關鍵事實我會回原始出處查證。
2. **驗證是我的工作**：你是機率性的，會一本正經地錯。提醒我每段碼要跑過、每個事實要查過才算數。
3. **完整揭露**：幫我維護 AI 使用紀錄，工具／日期／prompt 摘要／採用範圍，寫進每一站資料夾的 `README.md`。
4. **把牠說完整**：最後我要能說出我的物種，牠的世界、設計選擇與牠的一生。寫碼時用白話講清楚你做了什麼，讓我能導覽牠。我說「幫我練導覽」時，聽我講，並針對思考與選擇提問，不抽考程式。
5. **反思自己寫**：作業裡的反思、設計理由、研究報告結論必須是我自己的想法，你只能幫我調整結構和文句。

（補充：本專案不強制手寫程式也不考程式，全用你協作也可以，第四、五兩條是底線，故事要是我的，反思要是我的。）

## 交付提醒

- 每一站一個資料夾，名稱照這七個：`m0-outfit`、`m1-world`、`m2-species`、`m3-creature`、`m4-population`、`m5-habitat`、`m6-zoo`。
- 每個資料夾放四件套：可執行的程式碼、截圖或影片、`README.md` 裡的反思（一百到兩百字，我自己寫）與 AI 揭露欄。
- 課前準備與物種日誌寫在當站資料夾的 `notes.md`，檔案不存在就建一個。
- 報告站（M1／M2／M3／M6）每人都要上台簡報，我收尾這幾站時，主動提醒我簡報三件事（完整步驟照 README 的「簡報上傳」）：
  - 簡報**匯出成 PDF** 再上傳（GitHub 才能直接預覽），檔名用里程碑代號加「-簡報.pdf」放進該站資料夾（例：`m1-world/m1-簡報.pdf`）
  - 交上去之後到 repo 網頁**點開 PDF 能翻頁預覽**，才算交付成功
  - 簡報做重點不做逐字稿，內容針對該站進度：我做了什麼、為什麼這樣選、卡過哪裡怎麼解

## 我的工作流（M0 至少寫三條，之後隨學期自己補充）

- （例：新題目 → 先開研究 → 選型表 → 小實驗 → 再開始做）
- （例：卡關超過 30 分鐘 → 把錯誤訊息完整貼給你 → 先解釋再修）

## 效率工具配方（2026/11/05 裝，輕量三件套）

> 原則：不抓額外瀏覽器（用本機 Chrome），套件合計約 4MB。工具裝在專案 `devDependencies`，截圖腳本在 `tools/shot.js`。

### 1. 本地預覽（存檔即自動重刷）

```powershell
# 在 rain-project 根目錄
npm run serve
# 等同 npx live-server m2-species --port=3001 --no-browser
# 開 http://127.0.0.1:3001 改 sketch.js／style.css 存檔就刷
# （3000 可能被舊 local_server.js 佔用，故用 3001）
```

- 取代舊的 `m2-species/local_server.js`（可留著備用，但優先用 live-server）
- 之後其他站：`npm run serve` 前把 script 路徑換成該站資料夾，或直接 `npx live-server m1-world --port=3000 --no-browser`

### 2. 穩定截圖（puppeteer-core，一次到位）

```powershell
# 在 rain-project 根目錄；伺服器要先開著
node tools/shot.js "http://127.0.0.1:3001/" "C:\Users\annaj\AppData\Local\Temp\opencode\my-shot.png" 5000
# 參數：<url> <輸出png路徑> [等待毫秒，預設4000]
```

規則：
- **一定要先 `npm run serve` 再截**，不要截 `file://`（字型／CDN 可能被擋）
- WebGL 場景（three.js）等待至少 **4000–8000ms** 再拍
- 截圖路徑一律用 `C:\Users\annaj\AppData\Local\Temp\opencode\`，別放專案裡
- **絕不**連到使用者正在用的瀏覽器視窗；本腳本開的是獨立 headless 實例，安全

### 3. chrome-devtools-mcp（opencode 已掛）

- 已寫進 `~/.config/opencode/opencode.jsonc`：獨立 profile、headless、指向本機 Chrome
- **重啟 opencode 後生效**；生效後我可直接用 MCP 工具開頁、截圖、看 console，不必再組 shell
- 使用者規則不變：另開實例，不碰你的分頁

### 安裝來源（GitHub，研究紀錄）

| 工具 | Repo | 授權 |
|------|------|------|
| puppeteer-core | puppeteer/puppeteer | Apache-2.0 |
| live-server | tapio/live-server | MIT |
| chrome-devtools-mcp | ChromeDevTools/chrome-devtools-mcp | Apache-2.0 |

## 除錯工作流（2026/11/11 裝：逐行 debug ＋ 紅綠黃標註）

> 目標有兩個：**① 真的能一行一行跑**；**② 修過的東西不會被忘記**。
> 兩件事都由開源工具撐：`vscode-js-debug`（VS Code 內建）、`better-comments`、`todo-tree`、`todo-highlight`（VS Code 擴充套件）、`puppeteer-core` 的 CDP Debugger domain（本專案自寫 `tools/step-debug.js`）。

### A. 逐行 debug

**你（人）用 VS Code：**

1. 先 `npm run serve`（服務 repo 根，頁面在 `http://127.0.0.1:3001/m2-species/`）
2. VS Code 按 `F5`，右上角選「逐行 debug：m2-species（開獨立 Chrome）」
3. 在 `sketch.js` 點行號左邊下斷點 → `F10` 逐行執行／`F11` 進入函式／`Shift+F11` 跳出，左邊面板看 Locals 與 Call Stack
4. 設定檔在 `.vscode/launch.json`（已含 m1-world／m2-species 兩組）

> VS Code 內建的 JavaScript Debugger 就是 `microsoft/vscode-js-debug`（MIT），不用另外裝。

**我（AI）用指令稿：**

```powershell
node tools/step-debug.js http://127.0.0.1:3001/m2-species/ m2-species/sketch.js:275 --max 12
node tools/step-debug.js <url> <檔案:行號> --until 3150     # 逐步走到某一行
node tools/step-debug.js <url> <檔案:行號> --mode into      # 改成逐步「進入」
node tools/step-debug.js <url> --watch                     # 抓程式碼裡的 debugger; 陳述句
node tools/step-debug.js <url> <檔案:行號> --out trace.json # 輸出完整 trace 給我讀
```

- 原理：Chrome DevTools Protocol 的 `Debugger` domain → `setBreakpointByUrl` 下斷點 → `stepOver/stepInto/stepOut`
- 每停一行就印出「行號 + 那一行的原始碼 + 當下區域變數的值」，最後可輸出 JSON trace
- 開的是**獨立 headless Chrome**，絕不碰你正在用的瀏覽器分頁

### B. 紅綠黃標註（已修正／待修正／未修正）

**標記格式**（寫在原始碼的行內註解，VS Code 會自動上色）：

| 顏色 | 寫法 | 意思 |
|---|---|---|
| 🟢 綠 | `// FIXED-001: 說明` | 已修正並驗證過；**改壞了要回來看這裡** |
| 🟡 黃 | `// TODO-001: 說明` | 待修正，已知但還沒排到 |
| 🔴 紅 | `// BUG-001: 說明` | 已知未修正／需要重做 |

**指令：**

```powershell
npm run fix-status     # 重建 DEBUG_STATUS.md ＋ DEBUG_STATUS.json（改完程式必跑）
npm run fix-list       # 在終端機列出所有項目
npm run fix-pending    # 只列出紅／黃（還沒解決的）
npm run fix-verify     # 只列出「本次改動過的檔案」裡已修正的項目 → 回頭重驗
```

- `DEBUG_STATUS.md` 是**自動產生**的總表（紅／黃／綠三段＋逐檔案索引），不要手改；要改就改原始碼裡的標記
- VS Code 側：`better-comments` 上色、`todo-tree` 在左側列出全部標記（按檔案或按標籤分組）、`todo-highlight` 在大綱標示

### C. 我（AI）除錯時的鐵律

1. **動手前**先讀 `DEBUG_STATUS.md`，知道上一次修到哪、還欠哪些
2. **每修一個點**，就在那一行（或緊鄰的那行）加標記：修好且驗證過 → `FIXED-nnn`；還沒修 → `BUG-nnn`／`TODO-nnn`
3. **每輪改完**跑 `npm run fix-status` 重建總表
4. **收尾前**跑 `npm run fix-verify` → 把「本次改過的檔案裡面已修正的項目」重新驗一次，**避免修了後面忘了前面**
5. 跨 session 的記憶另外存進 LongMemory（`longmemory` MCP），所以新開一個 session 也接得上前面的進度

### 安裝來源（GitHub，研究紀錄）

| 工具 | Repo | 授權 | 用在哪 |
|------|------|------|--------|
| vscode-js-debug | microsoft/vscode-js-debug | MIT | VS Code 內建的 JavaScript 逐行 debugger |
| better-comments | aaron-bond/better-comments | MIT | 紅／綠／黃行內上色（1000 萬+ 安裝） |
| todo-tree | Gruntfuggly/todo-tree | MIT | 左側樹狀檢視全部標記 |
| todo-highlight | wayou/vscode-todo-highlight | MIT | 大綱標示 TODO/FIXME |
| puppeteer-core | puppeteer/puppeteer | Apache-2.0 | `tools/step-debug.js` 的 CDP 逐行引擎 |

