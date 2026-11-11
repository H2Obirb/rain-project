# 修正狀態總表（自動產生，勿手改）

> 這張表由 `node tools/fix-tracker.js` 從原始碼裡的行內標記自動重建。
> 每一行原始碼只要有 `FIXED-` / `TODO-` / `BUG-` 標記，就會出現在下面。
> 改完程式 → 跑一次 `npm run fix-status` → 這張表就是最新的真相。

> 最後更新：2026-11-11 13:55（由 `tools/fix-tracker.js` 產生）

## 一覽

| 狀態 | 顏色 | 數量 |
|---|---|---|
| 已修正（驗證過） | 🟢 綠 | 10 |
| 待修正（排隊中） | 🟡 黃 | 2 |
| 未修正（已知問題） | 🔴 紅 | 0 |

## 🔴 紅：未修正（已知問題，最優先）

_（目前沒有紅色項目）_

## 🟡 黃：待修正（已知但還沒排到）

| ID | 位置 | 說明 |
|---|---|---|
| 003 | `m2-species/sketch.js:3425` | three r128 的 transmission 不看 color，透出的是背景色而不是膜自己的顏色；要染色得改用手寫 shader |
| 004 | `m2-species/sketch.js:3427` | three r128 的 MeshPhysicalMaterial 沒有 thickness 參數，這行是 console 警告的來源 |

## 🟢 綠：已修正並驗證過

| ID | 位置 | 說明 |
|---|---|---|
| 001 | `m2-species/local_server.js:7` | 服務根統一成 repo 根（ROOT = ../），與 npm run serve 的 live-server 一致 → 兩種開法 URL 路徑相同 |
| 002 | `m2-species/local_server.js:8` | 根路徑 `/` 會轉到 m2-species/index.html，開 http://127.0.0.1:3000/ 就能看到場景 |
| 003 | `m2-species/local_server.js:9` | 補上 .glb / .gltf / .bin / .woff2 的 MIME type（GLB 是 model/gltf-binary） |
| 004 | `m2-species/local_server.js:10` | 加上路徑逃逸防護，filePath 必須在服務根底下否則 403 |
| 005 | `m2-species/local_server.js:33` | 用 302 轉址，不要用「改寫路徑」的方式回應。 |
| 002 | `m2-species/sketch.js:16` | 本檔於 2026/11/11 通過 node --check 語法檢查（除錯基準線） |
| 006 | `m2-species/sketch.js:1718` | 判定「布殼內側」的方式：用「從身體中軸指向該點」的方向當外側方向，外側方向與法線同向＝外表面，反向＝內表面 → 兜帽凹腔塗成純黑，外表面不受影響（一開始想用 gl_FrontFacing 判背面，但凹腔是朝前的正面，判不到） |
| 005 | `m2-species/sketch.js:1821` | 底布收成倒三角形尖角（AI 生成的模型底下被平切，正面看像一片梯形） |
| 003 | `m2-species/sketch.js:1945` | 愛的核心改回 AI 建模的兜帽裹屍布殼＋鑲在布縫裡的靶心眼（原 GLB 遺失，2026/11/11 用 C:\tools\hf_run_mv3.py 重新生成、decimate_glb.py 減面） |
| 004 | `m2-species/sketch.js:1957` | 眼球改成「把布面本身塗白」——不再另外擺一顆同心靶心球（舊值 (-0.074, 1.063, 0.110) 是沒乘 1.48 縮放的模型座標、球心又埋太深，只露出藍色一角的月牙）；白圓直接由布料 shader 在凸起處畫 → 永遠服貼布面不會穿模 |

## 逐檔案索引

### `m2-species/local_server.js`

- 🟢 **001** `L7` 服務根統一成 repo 根（ROOT = ../），與 npm run serve 的 live-server 一致 → 兩種開法 URL 路徑相同
- 🟢 **002** `L8` 根路徑 `/` 會轉到 m2-species/index.html，開 http://127.0.0.1:3000/ 就能看到場景
- 🟢 **003** `L9` 補上 .glb / .gltf / .bin / .woff2 的 MIME type（GLB 是 model/gltf-binary）
- 🟢 **004** `L10` 加上路徑逃逸防護，filePath 必須在服務根底下否則 403
- 🟢 **005** `L33` 用 302 轉址，不要用「改寫路徑」的方式回應。

### `m2-species/sketch.js`

- 🟢 **002** `L16` 本檔於 2026/11/11 通過 node --check 語法檢查（除錯基準線）
- 🟢 **006** `L1718` 判定「布殼內側」的方式：用「從身體中軸指向該點」的方向當外側方向，外側方向與法線同向＝外表面，反向＝內表面 → 兜帽凹腔塗成純黑，外表面不受影響（一開始想用 gl_FrontFacing 判背面，但凹腔是朝前的正面，判不到）
- 🟢 **005** `L1821` 底布收成倒三角形尖角（AI 生成的模型底下被平切，正面看像一片梯形）
- 🟢 **003** `L1945` 愛的核心改回 AI 建模的兜帽裹屍布殼＋鑲在布縫裡的靶心眼（原 GLB 遺失，2026/11/11 用 C:\tools\hf_run_mv3.py 重新生成、decimate_glb.py 減面）
- 🟢 **004** `L1957` 眼球改成「把布面本身塗白」——不再另外擺一顆同心靶心球（舊值 (-0.074, 1.063, 0.110) 是沒乘 1.48 縮放的模型座標、球心又埋太深，只露出藍色一角的月牙）；白圓直接由布料 shader 在凸起處畫 → 永遠服貼布面不會穿模
- 🟡 **003** `L3425` three r128 的 transmission 不看 color，透出的是背景色而不是膜自己的顏色；要染色得改用手寫 shader
- 🟡 **004** `L3427` three r128 的 MeshPhysicalMaterial 沒有 thickness 參數，這行是 console 警告的來源
