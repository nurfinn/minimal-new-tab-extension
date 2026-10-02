import { createChromeUpdateService, registerUpdatePage } from './chrome-update-service.mjs';
import { createTranslator } from './i18n-service.mjs';

const t = createTranslator();
const notice = document.createElement('aside');
notice.id = 'updateNotice';
notice.hidden = true;
const status = document.createElement('p');
status.setAttribute('role', 'status');
status.setAttribute('aria-atomic', 'true');
const actions = document.createElement('div');
actions.className = 'update-actions';
const update = document.createElement('button');
update.type = 'button';
update.id = 'applyUpdateButton';
update.textContent = t('updateNow');
const later = document.createElement('button');
later.type = 'button';
later.id = 'deferUpdateButton';
later.textContent = t('updateLater');
actions.append(update, later);
notice.append(status, actions);
document.body.append(notice);

let current = { status: 'hidden', reason: null };
function measure() {
  document.documentElement.style.setProperty('--update-notice-space',
    notice.hidden ? '0px' : `${Math.ceil(notice.getBoundingClientRect().height) + 24}px`);
}
function render() {
  notice.hidden = current.status === 'hidden' || Boolean(document.querySelector('dialog[open]'));
  const key = current.status === 'recovery' ? 'updateRecovery'
    : current.status === 'applying' ? 'updateApplying'
    : current.status === 'blocked' ? (current.reason === 'busy' ? 'updateBusy' : 'updateCheckFailed')
    : 'updateReady';
  const message = t(key);
  if (status.textContent !== message) status.textContent = message;
  actions.hidden = current.status === 'recovery';
  update.disabled = later.disabled = current.status === 'applying';
  measure();
}
const service = createChromeUpdateService({ onChange(value) { current = value; render(); } });
// Register the native listener before application/storage initialization.
const started = service.start().catch(() => { service.dispose(); });
const { updateSafety } = await import('./newtab.js');
let unregister = () => {};
if (globalThis.chrome?.extension?.getViews) {
  try { unregister = registerUpdatePage({ window, safety: updateSafety, service }); }
  catch { /* Missing participant keeps apply fail-closed. */ }
}
await started;

update.addEventListener('click', () => service.apply());
later.addEventListener('click', () => {
  const restoreFocus = notice.contains(document.activeElement);
  void service.snooze();
  if (restoreFocus && notice.hidden) document.getElementById('settingsButton')?.focus({ preventScroll: true });
});
const resize = new ResizeObserver(measure);
resize.observe(notice);
const dialogs = new MutationObserver(render);
for (const dialog of document.querySelectorAll('dialog')) dialogs.observe(dialog, { attributes: true, attributeFilter: ['open'] });
function activate() {
  if (document.visibilityState !== 'hidden') void service.refresh();
}
window.addEventListener('focus', activate);
document.addEventListener('visibilitychange', activate);
window.addEventListener('pagehide', () => {
  unregister(); service.dispose(); resize.disconnect(); dialogs.disconnect();
  window.removeEventListener('focus', activate);
  document.removeEventListener('visibilitychange', activate);
}, { once: true });
render();
