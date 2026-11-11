import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const origin = process.env.APP_ORIGIN || 'http://localhost:' + port;
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const json = (res, status, payload, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(payload)); };
const body = req => new Promise((resolve, reject) => { let data = ''; req.on('data', chunk => { data += chunk; if (data.length > 100_000) req.destroy(); }); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); });
const authToken = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
function configured() { return Boolean(supabaseUrl && supabaseAnonKey); }
function requireConfig(res) { if (!configured()) { json(res, 503, { error: 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env.' }); return false; } return true; }
async function supabaseFetch(path, options = {}, token = '') {
  const headers = { apikey: supabaseAnonKey, 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(options.headers || {}) };
  return fetch(supabaseUrl + path, { ...options, headers });
}
async function supabaseJson(path, options = {}, token = '') {
  const response = await supabaseFetch(path, options, token); const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function route(req, res) {
  const url = new URL(req.url, origin);
  if (url.pathname === '/api/config' && req.method === 'GET') return json(res, 200, { configured: configured(), supabaseUrl: configured() ? supabaseUrl : null, supabaseAnonKey: configured() ? supabaseAnonKey : null });
  if (url.pathname === '/api/auth/sign-up' && req.method === 'POST') {
    if (!requireConfig(res)) return;
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid signup request.' }); }
    const email = String(input.email || '').trim().toLowerCase(); const password = String(input.password || '');
    if (!emailPattern.test(email)) return json(res, 400, { error: 'Enter a valid email address.' });
    if (password.length < 8 || !/[A-Z]/.test(password)) return json(res, 400, { error: 'Password must have at least 8 characters and one uppercase character.' });
    const { response, data } = await supabaseJson('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password, data: { display_name: email.split('@')[0] } }) });
    if (!response.ok) return json(res, response.status, { error: data.msg || data.message || 'Could not create account.' });
    return json(res, 200, { ok: true, session: data.access_token ? data : null, user: data.user || null });
  }
  if (url.pathname === '/api/auth/sign-in' && req.method === 'POST') {
    if (!requireConfig(res)) return;
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid sign-in request.' }); }
    const email = String(input.email || '').trim().toLowerCase(); const password = String(input.password || '');
    if (!emailPattern.test(email) || !password) return json(res, 400, { error: 'Enter your email and password.' });
    const { response, data } = await supabaseJson('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (!response.ok) return json(res, response.status, { error: 'Email or password is incorrect.' });
    return json(res, 200, { ok: true, session: data, user: data.user });
  }
  if (url.pathname === '/api/jobs' && ['GET', 'POST'].includes(req.method)) {
    if (!requireConfig(res)) return;
    const token = authToken(req); if (!token) return json(res, 401, { error: 'Sign in required.' });
    if (req.method === 'GET') {
      const query = new URLSearchParams({ select: '*', order: 'service_date.desc,created_at.desc', limit: '100' });
      const { response, data } = await supabaseJson('/rest/v1/jobs?' + query, {}, token); return json(res, response.status, response.ok ? data : { error: data.message || 'Could not load jobs.' });
    }
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid job data.' }); }
    const allowed = { title: String(input.title || '').trim(), customer_name: String(input.customer_name || '').trim(), service_date: input.service_date || null, status: input.status || 'draft', summary: String(input.summary || '').trim(), amount: Number(input.amount || 0) };
    if (!allowed.title || !allowed.customer_name) return json(res, 400, { error: 'Job title and customer are required.' });
    const { response, data } = await supabaseJson('/rest/v1/jobs', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(allowed) }, token);
    return json(res, response.status, response.ok ? data[0] : { error: data.message || 'Could not create job.' });
  }
  if (url.pathname.startsWith('/api/jobs/') && req.method === 'PATCH') {
    if (!requireConfig(res)) return;
    const token = authToken(req); if (!token) return json(res, 401, { error: 'Sign in required.' });
    const id = url.pathname.split('/').pop(); let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid job data.' }); }
    const allowed = {}; for (const field of ['title', 'customer_name', 'service_date', 'status', 'summary', 'amount']) if (field in input) allowed[field] = input[field];
    const { response, data } = await supabaseJson('/rest/v1/jobs?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(allowed) }, token);
    return json(res, response.status, response.ok ? data[0] : { error: data.message || 'Could not update job.' });
  }
  if (url.pathname.startsWith('/api/jobs/') && req.method === 'DELETE') {
    if (!requireConfig(res)) return;
    const token = authToken(req); if (!token) return json(res, 401, { error: 'Sign in required.' });
    const id = url.pathname.split('/').pop(); const { response, data } = await supabaseJson('/rest/v1/jobs?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }, token);
    return json(res, response.status, response.ok ? { ok: true } : { error: data.message || 'Could not delete job.' });
  }
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
  let pathname = url.pathname === '/' ? '/index.html' : normalize(url.pathname); if (pathname.includes('..')) return json(res, 403, { error: 'Forbidden' });
  try { const file = await readFile(join(root, pathname)); const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' }; res.writeHead(200, { 'content-type': (types[extname(pathname)] || 'application/octet-stream') + '; charset=utf-8' }); res.end(file); } catch { json(res, 404, { error: 'Not found' }); }
}
createServer((req, res) => route(req, res).catch(() => json(res, 500, { error: 'Unexpected server error' }))).listen(port, () => console.log('Dispatch Draft running at ' + origin));
