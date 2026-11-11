import { createServer } from 'node:http';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const origin = process.env.APP_ORIGIN || 'http://localhost:' + port;
const accounts = new Map();
const sessions = new Map();
const jobs = new Map();
const streams = new Map();
const rateWindows = new Map();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (res, status, payload, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(payload)); };
const cookie = (name, value, maxAge) => name + '=' + value + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAge;
const getCookies = header => Object.fromEntries((header || '').split(';').map(value => value.trim().split('=').map(decodeURIComponent)).filter(value => value.length === 2));
const body = req => new Promise((resolve, reject) => { let data = ''; req.on('data', chunk => { data += chunk; if (data.length > 100_000) req.destroy(); }); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); });
const rateLimit = (key, windowMs, limit) => { const now = Date.now(); const recent = (rateWindows.get(key) || []).filter(time => now - time < windowMs); if (recent.length >= limit) return false; recent.push(now); rateWindows.set(key, recent); return true; };
const sessionFor = req => { const token = getCookies(req.headers.cookie).dispatch_session; return token ? sessions.get(token) : null; };
const userJobs = userId => [...jobs.values()].filter(job => job.owner_id === userId).sort((a, b) => (b.service_date || '').localeCompare(a.service_date || '') || b.created_at.localeCompare(a.created_at));
const publicUser = account => ({ id: account.id, email: account.email, display_name: account.display_name, company_name: account.company_name || '', role: account.role || '', timezone: account.timezone || '', setup_completed: Boolean(account.company_name) });
async function hashPassword(password, salt = randomBytes(16).toString('hex')) { const derived = await scrypt(password, salt, 64); return { salt, hash: Buffer.from(derived).toString('hex') }; }
async function verifyPassword(password, account) { const derived = await scrypt(password, account.salt, 64); const expected = Buffer.from(account.password_hash, 'hex'); return expected.length === derived.length && timingSafeEqual(expected, derived); }
function sendStream(userId, event, payload) { for (const stream of streams.get(userId) || []) stream.write('event: ' + event + '\\ndata: ' + JSON.stringify(payload) + '\\n\\n'); }
function createSession(account) { const token = randomBytes(32).toString('hex'); sessions.set(token, { user_id: account.id, expires_at: Date.now() + 14 * 24 * 60 * 60_000 }); return token; }
function requireSession(req, res) { const session = sessionFor(req); if (!session || session.expires_at < Date.now()) { if (session) sessions.delete(getCookies(req.headers.cookie).dispatch_session); json(res, 401, { error: 'Sign in required.' }); return null; } return session; }
function accountFrom(session) { return [...accounts.values()].find(account => account.id === session.user_id); }
function validatePassword(password) { return password.length >= 8 && /[A-Z]/.test(password); }
async function route(req, res) {
  const url = new URL(req.url, origin); const key = (req.socket.remoteAddress || 'unknown') + ':' + (req.headers['user-agent'] || 'unknown');
  if (url.pathname === '/api/auth/sign-up' && req.method === 'POST') {
    if (!rateLimit('signup:' + key, 15 * 60_000, 10)) return json(res, 429, { error: 'Too many attempts. Try again later.' });
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid signup request.' }); }
    const email = String(input.email || '').trim().toLowerCase(); const password = String(input.password || '');
    if (!emailPattern.test(email)) return json(res, 400, { error: 'Enter a valid email address.' });
    if (!validatePassword(password)) return json(res, 400, { error: 'Password must have at least 8 characters and one uppercase character.' });
    if (accounts.has(email)) return json(res, 409, { error: 'An account already exists for this email. Sign in instead.' });
    const displayName = String(input.display_name || email.split('@')[0]).replace(/[._-]+/g, ' ').trim().replace(/\b\w/g, char => char.toUpperCase());
    const credentials = await hashPassword(password); const account = { id: randomBytes(16).toString('hex'), email, display_name: displayName, company_name: '', role: '', timezone: '', ...credentials, created_at: new Date().toISOString() };
    accounts.set(email, account); const token = createSession(account);
    return json(res, 201, { ok: true, user: publicUser(account) }, { 'set-cookie': cookie('dispatch_session', token, 60 * 60 * 24 * 14) });
  }
  if (url.pathname === '/api/auth/sign-in' && req.method === 'POST') {
    if (!rateLimit('signin:' + key, 15 * 60_000, 20)) return json(res, 429, { error: 'Too many sign-in attempts. Try again later.' });
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid sign-in request.' }); }
    const email = String(input.email || '').trim().toLowerCase(); const password = String(input.password || ''); const account = accounts.get(email);
    if (!account || !(await verifyPassword(password, account))) return json(res, 401, { error: 'Email or password is incorrect.' });
    const token = createSession(account); return json(res, 200, { ok: true, user: publicUser(account) }, { 'set-cookie': cookie('dispatch_session', token, 60 * 60 * 24 * 14) });
  }
  if (url.pathname === '/api/auth/me' && req.method === 'GET') { const session = requireSession(req, res); if (!session) return; return json(res, 200, { authenticated: true, user: publicUser(accountFrom(session)) }); }
  if (url.pathname === '/api/account' && req.method === 'PATCH') { const session = requireSession(req, res); if (!session) return; let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid account data.' }); } const account = accountFrom(session); const companyName = String(input.company_name || '').trim(); const displayName = String(input.display_name || '').trim(); if (companyName.length < 2) return json(res, 400, { error: 'Enter your company name.' }); if (displayName.length < 2) return json(res, 400, { error: 'Enter your name.' }); account.company_name = companyName.slice(0, 100); account.display_name = displayName.slice(0, 80); account.role = String(input.role || '').trim().slice(0, 80); account.timezone = String(input.timezone || '').trim().slice(0, 80); return json(res, 200, { ok: true, user: publicUser(account) }); }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') { const token = getCookies(req.headers.cookie).dispatch_session; if (token) sessions.delete(token); return json(res, 200, { ok: true }, { 'set-cookie': cookie('dispatch_session', '', 0) }); }
  if (url.pathname === '/api/jobs/stream' && req.method === 'GET') {
    const session = requireSession(req, res); if (!session) return; res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }); res.write('event: ready\\ndata: {}\\n\\n'); const list = streams.get(session.user_id) || []; list.push(res); streams.set(session.user_id, list); req.on('close', () => streams.set(session.user_id, (streams.get(session.user_id) || []).filter(stream => stream !== res))); return;
  }
  if (url.pathname === '/api/jobs' && req.method === 'GET') { const session = requireSession(req, res); if (!session) return; return json(res, 200, userJobs(session.user_id)); }
  if (url.pathname === '/api/jobs' && req.method === 'POST') {
    const session = requireSession(req, res); if (!session) return; let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid job data.' }); }
    const title = String(input.title || '').trim(); const customerName = String(input.customer_name || '').trim(); if (!title || !customerName) return json(res, 400, { error: 'Job title and customer are required.' });
    const job = { id: randomBytes(8).toString('hex'), owner_id: session.user_id, title, customer_name: customerName, service_date: input.service_date || null, status: ['draft', 'review', 'completed'].includes(input.status) ? input.status : 'draft', summary: String(input.summary || '').trim(), amount: Math.max(0, Number(input.amount || 0)), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    jobs.set(job.id, job); sendStream(session.user_id, 'job.changed', job); return json(res, 201, job);
  }
  if (url.pathname.startsWith('/api/jobs/')) {
    const session = requireSession(req, res); if (!session) return; const id = url.pathname.split('/').pop(); const job = jobs.get(id); if (!job || job.owner_id !== session.user_id) return json(res, 404, { error: 'Job not found.' });
    if (req.method === 'DELETE') { jobs.delete(id); sendStream(session.user_id, 'job.deleted', { id }); return json(res, 200, { ok: true }); }
    if (req.method === 'PATCH') { let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid job data.' }); } for (const field of ['title', 'customer_name', 'service_date', 'summary', 'amount']) if (field in input) job[field] = input[field]; if (input.status && ['draft', 'review', 'completed'].includes(input.status)) job.status = input.status; job.updated_at = new Date().toISOString(); sendStream(session.user_id, 'job.changed', job); return json(res, 200, job); }
  }
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
  let pathname = url.pathname === '/' ? '/index.html' : normalize(url.pathname); if (pathname.includes('..')) return json(res, 403, { error: 'Forbidden' });
  try { const file = await readFile(join(root, pathname)); const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' }; res.writeHead(200, { 'content-type': (types[extname(pathname)] || 'application/octet-stream') + '; charset=utf-8' }); res.end(file); } catch { json(res, 404, { error: 'Not found' }); }
}
setInterval(() => { const now = Date.now(); for (const [token, session] of sessions) if (session.expires_at < now) sessions.delete(token); }, 60_000).unref();
createServer((req, res) => route(req, res).catch(() => json(res, 500, { error: 'Unexpected server error' }))).listen(port, () => console.log('Dispatch Draft in-memory server running at ' + origin));
