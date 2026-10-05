// Test-only static client + same-origin API proxy. Never installed as a live service.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
const root = resolve(process.env.FRONTIERDOM_CLIENT_DIR || 'dist');
const port = Number(process.env.FRONTIERDOM_PREVIEW_PORT || 4197);
const apiPort = Number(process.env.PORT || 3097);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    const proxy = http.request({ hostname: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: req.headers }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    });
    proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Preview proxy unavailable'); });
    req.pipe(proxy);
    return;
  }
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(path);
    const extension = path.slice(path.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Preview file not found'); }
});
server.listen(port, '127.0.0.1');
const stop = () => server.close(() => process.exit(0));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
