// NovaChat server: static hosting for the PWA (./dist), an optional CORS proxy for AI APIs,
// and optional chat sync. No runtime dependencies. Node 18+.
//
// Environment variables (all optional):
//   PORT                 port to listen on (Railway sets this for you)
//   HOST                 bind address (default 0.0.0.0)
//   ACCESS_TOKEN         if set, /api/proxy and /api/chats require header "x-nova-token: <token>"
//   DATA_DIR             where chats.json is stored (defaults to the Railway Volume mount path if one is attached)
//   ALLOW_PRIVATE_PROXY  set to 1 to let the proxy reach localhost / private networks (local use only)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');
const { Readable } = require('stream');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DIST = path.join(__dirname, 'dist');
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const DB = path.join(DATA_DIR, 'chats.json');
const TOKEN = process.env.ACCESS_TOKEN || '';
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_PROXY === '1';
const MAX_BODY = 25 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt', '.ico']);
const BLOCKED_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'cookie', 'origin', 'referer', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-nova-token', 'accept-encoding']);

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html is missing. Run "npm install" then "npm run build:client" first.');
  process.exit(1);
}
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  console.warn('Could not create DATA_DIR (' + DATA_DIR + '): ' + e.message + ' - chat sync is disabled.');
}

/* ---------- helpers ---------- */
const send = (res, status, obj) => {
  if (res.headersSent) return res.end();
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        const err = new Error('Request too large');
        err.status = 413;
        reject(err);
        req.destroy();
        return;
      }
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const authorized = (req) => !TOKEN || crypto.timingSafeEqual(digest(req.headers['x-nova-token'] || ''), digest(TOKEN));

const hits = new Map();
function limited(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || h.reset < now) hits.set(ip, (h = { n: 0, reset: now + 60000 }));
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  return ++h.n > 300;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('::ffff:')) return net.isIPv4(v.slice(7)) ? isPrivateIp(v.slice(7)) : true;
  return /^(fc|fd|fe[89ab])/.test(v);
}

/* ---------- /api/proxy ---------- */
async function handleProxy(req, res) {
  let o;
  try {
    o = JSON.parse((await readBody(req)).toString());
  } catch (e) {
    return send(res, e.status || 400, { error: e.status === 413 ? 'Request too large' : 'Bad request' });
  }
  let url;
  try {
    url = new URL(o.url);
  } catch {
    return send(res, 400, { error: 'Invalid URL' });
  }
  if (url.protocol !== 'https:' && !(ALLOW_PRIVATE && url.protocol === 'http:')) return send(res, 400, { error: 'Only https URLs can be proxied' });
  if (!ALLOW_PRIVATE) {
    try {
      const addrs = await dns.lookup(url.hostname, { all: true });
      if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return send(res, 403, { error: 'That host is not allowed' });
    } catch {
      return send(res, 502, { error: 'Could not resolve host' });
    }
  }
  const method = String(o.method || 'POST').toUpperCase();
  if (method !== 'GET' && method !== 'POST') return send(res, 400, { error: 'Unsupported method' });
  const headers = {};
  for (const [k, v] of Object.entries(o.headers || {})) if (typeof v === 'string' && !BLOCKED_HEADERS.has(k.toLowerCase())) headers[k] = v;

  const ctl = new AbortController();
  res.on('close', () => ctl.abort());
  let upstream;
  try {
    upstream = await fetch(url, { method, headers, body: method === 'GET' ? undefined : o.body, signal: ctl.signal, redirect: 'error' });
  } catch (e) {
    return send(res, 502, { error: e.message });
  }
  res.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') || 'application/json',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no', // keep streamed tokens flowing through proxies
  });
  if (!upstream.body) return res.end();
  Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
}

/* ---------- /api/chats ---------- */
async function handleChats(req, res) {
  if (req.method === 'PUT') {
    try {
      const body = await readBody(req);
      if (!Array.isArray(JSON.parse(body.toString()))) throw new Error('not an array');
      fs.writeFileSync(DB + '.tmp', body);
      fs.renameSync(DB + '.tmp', DB);
      return send(res, 200, { ok: true });
    } catch (e) {
      return send(res, e.status || 400, { error: e.status === 413 ? 'Too large' : 'Invalid chats payload' });
    }
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(fs.existsSync(DB) ? fs.readFileSync(DB) : '[]');
}

/* ---------- static files ---------- */
function sendFile(req, res, file, st) {
  const ext = path.extname(file).toLowerCase();
  const rel = '/' + path.relative(DIST, file).split(path.sep).join('/');
  const etag = 'W/"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
  const hashed = /^\/app-[A-Z0-9]{8}\.(js|css)$/.test(rel);
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    etag,
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : rel.startsWith('/icons/') ? 'public, max-age=86400' : 'no-cache',
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const gzip = COMPRESSIBLE.has(ext) && st.size > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gzip) {
    headers['content-encoding'] = 'gzip';
    headers.vary = 'Accept-Encoding';
  } else headers['content-length'] = st.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  (gzip ? stream.pipe(zlib.createGzip()) : stream).pipe(res);
}

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) return sendFile(req, res, file, st);
    const wantsPage = !path.extname(rel) && (req.headers.accept || '').includes('text/html');
    if (wantsPage) {
      const index = path.join(DIST, 'index.html');
      return fs.stat(index, (e, s) => (e ? (res.writeHead(404), res.end('Not found')) : sendFile(req, res, index, s)));
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  const pathname = (req.url || '/').split('?')[0];
  try {
    if (pathname === '/healthz') return send(res, 200, { ok: true });
    if (pathname === '/api/proxy' || pathname === '/api/chats') {
      if (!authorized(req)) return send(res, 401, { error: 'Missing or wrong access token' });
      if (limited(req)) return send(res, 429, { error: 'Too many requests' });
      if (pathname === '/api/proxy') return req.method === 'POST' ? await handleProxy(req, res) : send(res, 405, { error: 'Method not allowed' });
      return await handleChats(req, res);
    }
    if (pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }
    serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Server error' });
  }
});

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Set another one, e.g. PORT=4000.` : e);
  process.exit(1);
});
server.keepAliveTimeout = 65000;
server.listen(PORT, HOST, () => console.log(`NovaChat running on http://localhost:${PORT}${TOKEN ? ' (access token required for /api)' : ''}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
