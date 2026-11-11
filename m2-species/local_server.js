const http = require('http');
const fs = require('fs');
const path = require('path');

// 【除錯標註約定】綠=FIXED-nnn（已修正）／黃=TODO-nnn（待修正）／紅=BUG-nnn（已知未修）
// 完整寫法是「狀態-編號: 說明」
// FIXED-001: 服務根統一成 repo 根（ROOT = ../），與 npm run serve 的 live-server 一致 → 兩種開法 URL 路徑相同
// FIXED-002: 根路徑 `/` 會轉到 m2-species/index.html，開 http://127.0.0.1:3000/ 就能看到場景
// FIXED-003: 補上 .glb / .gltf / .bin / .woff2 的 MIME type（GLB 是 model/gltf-binary）
// FIXED-004: 加上路徑逃逸防護，filePath 必須在服務根底下否則 403

const ROOT = path.resolve(__dirname, '..');
const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',   // AI 建模產生的 3D 模型
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  let reqUrl = decodeURIComponent(req.url.split('?')[0]);
  // 首頁 → m2-species 這一站
  // FIXED-005: 用 302 轉址，不要用「改寫路徑」的方式回應。
  //   改寫的話 HTML 雖然回來了，但瀏覽器仍以 / 為基準解析相對路徑
  //   → sketch.js / style.css 會變成 /sketch.js / style.css → 整頁 404、場景起不來。
  if (reqUrl === '/') {
    res.writeHead(302, { 'Location': '/m2-species/index.html' });
    res.end();
    return;
  }

  const filePath = path.join(ROOT, reqUrl);
  // 防止路徑跳出服務根
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    // 目錄 → 自動補 index.html（瀏覽器請求 /m2-species/ 這種帶斜尾的目錄路徑）
    let sendPath = filePath;
    if (stats.isDirectory()) {
      sendPath = path.join(filePath, 'index.html');
      if (!fs.existsSync(sendPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
    }

    const ext = path.extname(sendPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(sendPath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running at http://localhost:${PORT}/m2-species/`);
});
