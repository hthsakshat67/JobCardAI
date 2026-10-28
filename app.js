document.addEventListener('DOMContentLoaded', () => {
  const marketing = document.querySelector('#marketing-shell'); const auth = document.querySelector('#auth-shell'); const app = document.querySelector('#app-shell');
  const sections = [...document.querySelectorAll('.page-section')]; const navButtons = [...document.querySelectorAll('[data-page]')]; const crumb = document.querySelector('#page-crumb'); const toast = document.querySelector('#toast');
  const names = { dashboard: 'Dashboard', editor: 'Create job card', jobs: 'Job cards', history: 'Job history', templates: 'Templates', pricing: 'Plans & billing', settings: 'Settings' };
  const icons = () => window.lucide?.createIcons();
  const showToast = message => { if (!toast) return; toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); };
  function applyIdentity(email) {
    const local = String(email || 'operator').split('@')[0].replace(/[._-]+/g, ' ').trim();
    const display = local.split(' ').map(part => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : '').join(' ');
    const first = display.split(' ')[0] || 'Operator';
    const initials = display.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => { if (!node.nodeValue.trim()) return; node.nodeValue = node.nodeValue.replaceAll('Alex Carter', display).replaceAll('Alex', first); if (node.nodeValue.trim() === 'AC') node.nodeValue = initials; });
    document.querySelectorAll('input[placeholder="Technician"]').forEach(input => input.value = display);
    document.title = `${display} · JobCard`;
  }
  function showPage(id) { sections.forEach(section => section.classList.toggle('active', section.id === id)); document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === id || (id === 'editor' && button.dataset.page === 'jobs'))); if (crumb) crumb.textContent = names[id] || 'Dashboard'; window.scrollTo({ top: 0, behavior: 'smooth' }); document.querySelector('.sidebar')?.classList.remove('open'); icons(); }
  navButtons.forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
  document.querySelector('.mobile-menu')?.addEventListener('click', () => document.querySelector('.sidebar')?.classList.toggle('open'));
  document.querySelector('#save-job')?.addEventListener('click', event => { event.preventDefault(); const form = document.querySelector('#job-form'); if (form.reportValidity()) showToast('Job card saved successfully'); });
  document.querySelector('#save-settings')?.addEventListener('click', () => showToast('Workspace settings saved'));
  const title = document.querySelector('input[placeholder*="Annual HVAC"]'); const customer = document.querySelector('input[placeholder*="Brightline"]'); const summary = document.querySelector('textarea[placeholder*="concise"]');
  title?.addEventListener('input', e => document.querySelector('#preview-title').textContent = e.target.value || 'Annual HVAC maintenance'); customer?.addEventListener('input', e => document.querySelector('#preview-customer').textContent = e.target.value || 'Customer name'); summary?.addEventListener('input', e => document.querySelector('#preview-summary').textContent = e.target.value || 'Your work summary will appear here once you start typing.');
  const setMessage = (id, value = '') => { const el = document.querySelector(`#${id}`); if (el) el.textContent = value; };
  const emailInput = document.querySelector('#email');
  async function api(path, options = {}) { const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Something went wrong.'); return data; }
  document.querySelector('#email-form')?.addEventListener('submit', async event => { event.preventDefault(); const email = emailInput.value.trim().toLowerCase(); setMessage('email-message'); try { const data = await api('/api/auth/sign-in', { method: 'POST', body: JSON.stringify({ email }) }); if (data.ok) { location.hash = '#app'; route(); } } catch (error) { setMessage('email-message', error.message); } });
  async function route() { const hash = location.hash || '#home'; let me; try { me = await api('/api/auth/me'); } catch {} if (hash.startsWith('#app')) { if (!me?.authenticated) { location.hash = '#login'; return route(); } applyIdentity(me.user.email); marketing.hidden = true; auth.hidden = true; app.classList.add('is-visible'); showPage('dashboard'); return; } app.classList.remove('is-visible'); if (hash.startsWith('#login')) { marketing.hidden = true; auth.hidden = false; } else { auth.hidden = true; marketing.hidden = false; document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el)); } icons(); }
  document.querySelector('#dashboard')?.addEventListener('mousemove', event => { const rect = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`); event.currentTarget.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`); });
  const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('in-view'); }), { threshold: .14 });
  window.addEventListener('hashchange', route); route(); icons();
});
