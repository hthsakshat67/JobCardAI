document.addEventListener('DOMContentLoaded', () => {
  const sections = [...document.querySelectorAll('.page-section')];
  const navButtons = [...document.querySelectorAll('[data-page]')];
  const crumb = document.querySelector('#page-crumb');
  const toast = document.querySelector('#toast');
  const names = { dashboard: 'Dashboard', editor: 'Create job card', jobs: 'Job cards', history: 'Job history', templates: 'Templates', pricing: 'Plans & billing', settings: 'Settings' };
  function refreshIcons() { if (window.lucide) lucide.createIcons(); }
  function showPage(id) {
    sections.forEach(section => section.classList.toggle('active', section.id === id));
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === id || (id === 'editor' && button.dataset.page === 'jobs')));
    crumb.textContent = names[id] || 'Dashboard';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelector('.sidebar')?.classList.remove('open');
    refreshIcons();
  }
  navButtons.forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
  document.querySelector('.mobile-menu')?.addEventListener('click', () => document.querySelector('.sidebar')?.classList.toggle('open'));
  function showToast(message) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); }
  document.querySelector('#save-job')?.addEventListener('click', (event) => { event.preventDefault(); const form = document.querySelector('#job-form'); if (form.reportValidity()) showToast('Job card saved successfully'); });
  document.querySelector('#save-settings')?.addEventListener('click', () => showToast('Workspace settings saved'));
  const title = document.querySelector('input[placeholder*="Annual HVAC"]');
  const customer = document.querySelector('input[placeholder*="Brightline"]');
  const summary = document.querySelector('textarea[placeholder*="concise"]');
  title?.addEventListener('input', e => document.querySelector('#preview-title').textContent = e.target.value || 'Annual HVAC maintenance');
  customer?.addEventListener('input', e => document.querySelector('#preview-customer').textContent = e.target.value || 'Customer name');
  summary?.addEventListener('input', e => document.querySelector('#preview-summary').textContent = e.target.value || 'Your work summary will appear here once you start typing.');
  refreshIcons();
});
