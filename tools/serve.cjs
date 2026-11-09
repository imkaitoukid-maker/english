/* Local preview only. GitHub Pages serves the static files directly. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8844);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.wasm':'application/wasm', '.data':'application/octet-stream', '.wav':'audio/wav', '.svg':'image/svg+xml', '.md':'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (pathname === '/') { res.writeHead(302, { Location: '/english-speech-demo/' }); res.end(); return; }
  if (pathname === '/english-speech-demo') { res.writeHead(302, { Location: '/english-speech-demo/' }); res.end(); return; }
  if (!pathname.startsWith('/english-speech-demo/')) { res.writeHead(404); res.end(); return; }
  const relative = pathname.slice('/english-speech-demo/'.length) || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || relative.split(/[\\/]/).some(part => part.startsWith('.'))) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Content-Length':stat.size, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  });
}).listen(port, '127.0.0.1', () => console.log(`Say it preview: http://127.0.0.1:${port}/english-speech-demo/`));
