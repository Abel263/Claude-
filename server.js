// GhostView server for Render, Railway, Fly.io or your own computer:  node server.js
// (On Vercel, the files in /api are used instead. See README.)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { tiktokProfile, fetchImage, allow, clientIp, normUser, USER_RX } = require('./lib/core');

const PORT = Number(process.env.PORT) || 3000;
const INDEX = path.join(__dirname, 'index.html');

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isBuf ? headers['Content-Type'] : 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers
  });
  res.end(isBuf ? body : JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = clientIp(req);
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method' });
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, service: 'ghostview' });
    if (url.pathname.startsWith('/api/tiktok/profile/')) {
      if (!allow(ip, 'p', 30)) return send(res, 429, { error: 'rate_limited' }, { 'Retry-After': '20' });
      const user = normUser(url.pathname.split('/').pop());
      if (!USER_RX.test(user)) return send(res, 400, { error: 'invalid_username' });
      const r = await tiktokProfile(user).catch(() => ({ status: 502, error: 'upstream_unavailable' }));
      return send(res, r.status, r, { 'Cache-Control': 'no-store' });
    }
    if (url.pathname === '/api/img') {
      if (!allow(ip, 'i', 400)) return send(res, 429, { error: 'rate_limited' });
      const r = await fetchImage(url.searchParams.get('u') || '');
      return r.status === 200 ? send(res, 200, r.body, { 'Content-Type': r.type, 'Cache-Control': 'public, max-age=86400' }) : send(res, r.status, { error: r.error });
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return fs.readFile(INDEX, (err, buf) => err ? send(res, 500, { error: 'missing index.html' })
        : send(res, 200, buf, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }));
    }
    send(res, 404, { error: 'not_found' });
  } catch { send(res, 500, { error: 'server_error' }); }
}).listen(PORT, () => console.log(`GhostView running on http://localhost:${PORT}`));
