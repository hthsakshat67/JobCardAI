import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
const secret = process.env.SESSION_SECRET || 'local-only-change-this-secret';
const requests = new Map();
const sessions = new Map();

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};
const cookie = (name, value, maxAge) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
const getCookies = header => Object.fromEntries((header || '').split(';').map(v => v.trim().split('=').map(decodeURIComponent)).filter(v => v.length === 2));
const body = req => new Promise((resolve, reject) => { let data = ''; req.on('data', chunk => { data += chunk; if (data.length > 20_000) req.destroy(); }); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const requestKey = req => `${req.socket.remoteAddress || 'unknown'}:${req.headers['user-agent'] || 'unknown'}`;
function rateLimit(key, windowMs, limit) { const now = Date.now(); const recent = (requests.get(key) || []).filter(t => now - t < windowMs); if (recent.length >= limit) return false; recent.push(now); requests.set(key, recent); return true; }
function sessionFrom(req) { const id = getCookies(req.headers.cookie).jobcard_session; return id && sessions.get(id); }
async function route(req, res) {
  const url = new URL(req.url, origin);
  if (url.pathname === '/api/auth/sign-in' && req.method === 'POST') {
    if (!rateLimit(`sign-in:${requestKey(req)}`, 15 * 60_000, 20)) return json(res, 429, { error: 'Too many sign-in attempts. Try again later.' });
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Please send a valid email address.' }); }
    const email = String(input.email || '').trim().toLowerCase();
    if (!emailPattern.test(email) || email.length > 254) return json(res, 400, { error: 'Enter a valid email address.' });
    const sessionId = `${randomInt(1e9, 1e10)}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessions.set(sessionId, { email, createdAt: Date.now() });
    return json(res, 200, { ok: true, user: { email } }, { 'set-cookie': cookie('jobcard_session', sessionId, 60 * 60 * 24 * 14) });
  }
  if (url.pathname === '/api/auth/me' && req.method === 'GET') { const session = sessionFrom(req); return session ? json(res, 200, { authenticated: true, user: { email: session.email } }) : json(res, 401, { authenticated: false }); }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') { const id = getCookies(req.headers.cookie).jobcard_session; if (id) sessions.delete(id); return json(res, 200, { ok: true }, { 'set-cookie': cookie('jobcard_session', '', 0) }); }
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
  let pathname = url.pathname === '/' ? '/index.html' : normalize(url.pathname); if (pathname.includes('..')) return json(res, 403, { error: 'Forbidden' });
  try { const file = await readFile(join(root, pathname)); const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' }; res.writeHead(200, { 'content-type': `${types[extname(pathname)] || 'application/octet-stream'}; charset=utf-8` }); res.end(file); } catch { json(res, 404, { error: 'Not found' }); }
}
setInterval(() => { const now = Date.now(); for (const [key, record] of sessions) if (now - record.createdAt > 14 * 24 * 60 * 60_000) sessions.delete(key); }, 60_000).unref();
createServer((req, res) => route(req, res).catch(() => json(res, 500, { error: 'Unexpected server error' }))).listen(port, () => console.log(`JobCard running at ${origin}`));
