import { createServer } from 'node:http';
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
const secret = process.env.SESSION_SECRET || 'local-only-change-this-secret';
const otpTtlMs = Number(process.env.OTP_TTL_SECONDS || 600) * 1000;
const requests = new Map();
const sessions = new Map();

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};
const hash = value => createHash('sha256').update(`${value}:${secret}`).digest('hex');
const cookie = (name, value, maxAge) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
const getCookies = header => Object.fromEntries((header || '').split(';').map(v => v.trim().split('=').map(decodeURIComponent)).filter(v => v.length === 2));
const body = req => new Promise((resolve, reject) => { let data = ''; req.on('data', chunk => { data += chunk; if (data.length > 20_000) req.destroy(); }); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const requestKey = req => `${req.socket.remoteAddress || 'unknown'}:${req.headers['user-agent'] || 'unknown'}`;
function rateLimit(key, windowMs, limit) { const now = Date.now(); const recent = (requests.get(key) || []).filter(t => now - t < windowMs); if (recent.length >= limit) return false; recent.push(now); requests.set(key, recent); return true; }
function sessionFrom(req) { const id = getCookies(req.headers.cookie).jobcard_session; return id && sessions.get(id); }
async function sendOtp(email, code) {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return false;
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.MAIL_FROM, to: [email], subject: `${code} is your JobCard sign-in code`, html: `<div style="font-family:Arial,sans-serif;color:#1f2937;max-width:520px"><p style="font-size:18px;font-weight:700">JobCard</p><h1 style="font-size:28px;letter-spacing:8px">${code}</h1><p>This code expires in 10 minutes and can only be used once.</p><p style="color:#64748b;font-size:12px">If you did not request this, you can safely ignore this email.</p></div>` }) });
  return response.ok;
}
async function route(req, res) {
  const url = new URL(req.url, origin);
  if (url.pathname === '/api/auth/request-otp' && req.method === 'POST') {
    if (!rateLimit(`request:${requestKey(req)}`, 15 * 60_000, 8)) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Please send a valid email address.' }); }
    const email = String(input.email || '').trim().toLowerCase();
    if (!emailPattern.test(email) || email.length > 254) return json(res, 400, { error: 'Enter a valid email address.' });
    const previous = requests.get(`email:${email}`) || [];
    if (previous.some(t => Date.now() - t < 60_000)) return json(res, 429, { error: 'Please wait a minute before requesting another code.' });
    requests.set(`email:${email}`, [...previous.filter(t => Date.now() - t < 15 * 60_000), Date.now()]);
    const code = String(randomInt(100000, 1000000));
    sessions.set(`otp:${email}`, { codeHash: hash(code), expiresAt: Date.now() + otpTtlMs, attempts: 0 });
    try {
      const sent = await sendOtp(email, code);
      if (!sent && process.env.NODE_ENV === 'production') return json(res, 503, { error: 'Email delivery is not configured. Please try again later.' });
      return json(res, 200, { ok: true, email, expiresIn: otpTtlMs / 1000, previewMode: !sent, ...(process.env.SHOW_DEV_OTP === 'true' ? { devCode: code } : {}) });
    } catch { return json(res, 502, { error: 'We could not send your code. Please try again.' }); }
  }
  if (url.pathname === '/api/auth/verify-otp' && req.method === 'POST') {
    if (!rateLimit(`verify:${requestKey(req)}`, 15 * 60_000, 20)) return json(res, 429, { error: 'Too many verification attempts.' });
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid request.' }); }
    const email = String(input.email || '').trim().toLowerCase(); const code = String(input.code || '').trim(); const record = sessions.get(`otp:${email}`);
    if (!record || Date.now() > record.expiresAt) return json(res, 400, { error: 'That code has expired. Request a new one.' });
    record.attempts += 1; if (record.attempts > 5) { sessions.delete(`otp:${email}`); return json(res, 400, { error: 'Too many attempts. Request a new code.' }); }
    const expected = Buffer.from(record.codeHash); const actual = Buffer.from(hash(code));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json(res, 400, { error: 'That code is not correct.' });
    sessions.delete(`otp:${email}`); const sessionId = `${randomInt(1e9, 1e10)}-${Date.now()}`; sessions.set(sessionId, { email, createdAt: Date.now() });
    return json(res, 200, { ok: true, user: { email } }, { 'set-cookie': cookie('jobcard_session', sessionId, 60 * 60 * 24 * 14) });
  }
  if (url.pathname === '/api/auth/me' && req.method === 'GET') { const session = sessionFrom(req); return session ? json(res, 200, { authenticated: true, user: { email: session.email } }) : json(res, 401, { authenticated: false }); }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') { const id = getCookies(req.headers.cookie).jobcard_session; if (id) sessions.delete(id); return json(res, 200, { ok: true }, { 'set-cookie': cookie('jobcard_session', '', 0) }); }
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
  let pathname = url.pathname === '/' ? '/index.html' : normalize(url.pathname); if (pathname.includes('..')) return json(res, 403, { error: 'Forbidden' });
  try { const file = await readFile(join(root, pathname)); const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' }; res.writeHead(200, { 'content-type': `${types[extname(pathname)] || 'application/octet-stream'}; charset=utf-8` }); res.end(file); } catch { json(res, 404, { error: 'Not found' }); }
}
setInterval(() => { const now = Date.now(); for (const [key, record] of sessions) if (key.startsWith('otp:') ? now > record.expiresAt : now - record.createdAt > 14 * 24 * 60 * 60_000) sessions.delete(key); }, 60_000).unref();
createServer((req, res) => route(req, res).catch(() => json(res, 500, { error: 'Unexpected server error' }))).listen(port, () => console.log(`JobCard running at ${origin}`));
