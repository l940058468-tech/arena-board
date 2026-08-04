const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'arena-stats.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

let stats = null;
let refreshing = false;

function loadStats() {
  if (!fs.existsSync(DATA_FILE)) return null;
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function safeSend(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function serveStatic(res, urlPath) {
  const requested = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath.split('?')[0]);
  const filePath = path.join(PUBLIC_DIR, path.normalize(requested).replace(/^([.][.][/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    safeSend(res, 403, 'Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      safeSend(res, 404, 'Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-store' : 'max-age=60',
    });
    res.end(data);
  });
}

function startRefresh() {
  if (refreshing) return false;
  refreshing = true;
  const child = spawn(process.execPath, [path.join(ROOT, 'scraper.js')], {
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('exit', () => {
    stats = loadStats();
    refreshing = false;
  });
  return true;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname === '/api/stats') {
    if (!stats) {
      safeSend(res, 503, JSON.stringify({ error: 'data not ready' }), 'application/json; charset=utf-8');
      return;
    }
    safeSend(res, 200, JSON.stringify(stats), 'application/json; charset=utf-8');
    return;
  }

  if (url.pathname === '/api/refresh' && req.method === 'POST') {
    const started = startRefresh();
    safeSend(res, started ? 202 : 409, JSON.stringify({ started }), 'application/json; charset=utf-8');
    return;
  }

  serveStatic(res, url.pathname);
});

stats = loadStats();
if (!stats) {
  console.log('No cached data found, fetching now...');
  const child = spawn(process.execPath, [path.join(ROOT, 'scraper.js')], {
    stdio: 'inherit',
    windowsHide: true,
  });
  child.on('exit', () => {
    stats = loadStats();
    server.listen(PORT, HOST, () => {
      console.log(`Arena board running at http://${HOST}:${PORT}`);
    });
  });
} else {
  server.listen(PORT, HOST, () => {
    console.log(`Arena board running at http://${HOST}:${PORT}`);
    console.log(`Cached data: ${stats.patch}, ${stats.champions.length} champions, updated ${stats.updatedAt}`);
  });
}
