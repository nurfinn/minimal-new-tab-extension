import { getExtensionApi } from '../extension-api.mjs';
import { createTranslator } from '../i18n-service.mjs';
import { setRemoteFaviconLoading } from './favicon-service.mjs';

export const FAVICON_DATA_PERMISSION = Object.freeze({
  data_collection: Object.freeze(['browsingActivity']),
});
export const FAVICON_SOURCES_CHANGED_EVENT = 'firefox-favicon-sources-changed';

const OFF_STATE = Object.freeze({
  supported: true,
  enabled: false,
  error: false,
  pending: false,
});

export function createFaviconPermissionController({
  permissions,
  onStateChange = () => {},
} = {}) {
  let state = OFF_STATE;
  let refreshRevision = 0;

  function publish(next) {
    state = Object.freeze(next);
    onStateChange(state);
    return state;
  }

  async function refresh({ settle = false } = {}) {
    if (state.pending && !settle) return state;
    const revision = ++refreshRevision;
    if (typeof permissions?.getAll !== 'function') {
      return publish({ supported: false, enabled: false, error: false, pending: false });
    }

    try {
      const granted = await permissions.getAll();
      if (revision !== refreshRevision || (state.pending && !settle)) return state;
      if (!Array.isArray(granted?.data_collection)) {
        return publish({ supported: false, enabled: false, error: false, pending: false });
      }

      return publish({
        supported: true,
        enabled: granted.data_collection.includes('browsingActivity'),
        error: false,
        pending: false,
      });
    } catch {
      if (revision !== refreshRevision || (state.pending && !settle)) return state;
      return publish({ supported: true, enabled: false, error: true, pending: false });
    }
  }

  async function enable() {
    if (state.pending) return state;
    if (typeof permissions?.request !== 'function') {
      return publish({ supported: false, enabled: false, error: false, pending: false });
    }

    const confirmed = state.enabled;
    refreshRevision += 1;
    publish({ supported: true, enabled: confirmed, error: false, pending: true });
    try {
      // Keep this call in the initiating user activation, before any await.
      const granted = await permissions.request(FAVICON_DATA_PERMISSION);
      return granted
        ? refresh({ settle: true })
        : publish({ supported: true, enabled: confirmed, error: false, pending: false });
    } catch {
      return publish({ supported: true, enabled: confirmed, error: true, pending: false });
    }
  }

  async function disable() {
    if (state.pending) return state;
    if (typeof permissions?.remove !== 'function') {
      return publish({ supported: false, enabled: false, error: false, pending: false });
    }

    const confirmed = state.enabled;
    refreshRevision += 1;
    publish({ supported: true, enabled: confirmed, error: false, pending: true });
    try {
      await permissions.remove(FAVICON_DATA_PERMISSION);
      return refresh({ settle: true });
    } catch {
      return publish({ supported: true, enabled: confirmed, error: true, pending: false });
    }
  }

  return {
    get state() {
      return state;
    },
    refresh,
    enable,
    disable,
  };
}

export async function initializeFaviconSettings({
  root = document,
  permissions = getExtensionApi()?.permissions,
  translate = createTranslator(),
  eventTarget = document,
} = {}) {
  const configure = root.getElementById('faviconSettingsConfigure');
  const disclosure = root.getElementById('faviconSettingsDisclosure');
  const toggle = root.getElementById('remoteFaviconToggle');
  const mode = root.getElementById('faviconSettingsMode');
  const status = root.getElementById('remoteFaviconStatus');
  const error = root.getElementById('faviconSettingsError');

  if (!toggle || !status || !error) {
    setRemoteFaviconLoading(false);
    return { destroy() {} };
  }

  function render(next) {
    const changed = setRemoteFaviconLoading(next.enabled);
    toggle.checked = next.enabled;
    toggle.disabled = next.pending || !next.supported;
    // These labels are owned by permission state, not static localization.
    mode?.removeAttribute('data-i18n');
    status.removeAttribute('data-i18n');
    if (mode) {
      mode.textContent = translate(next.enabled ? 'siteIconsLocalRemote' : 'siteIconsLocalOnly');
    }
    status.textContent = translate(next.pending
      ? 'siteIconsPending' : next.enabled ? 'siteIconsOn' : 'siteIconsOff');
    status.classList.toggle('visually-hidden', !next.pending);
    root.getElementById('faviconSettingsRow')?.classList.toggle('is-pending', next.pending);
    error.hidden = !next.error && next.supported;
    error.textContent = next.error
      ? translate('siteIconsPermissionError')
      : next.supported
        ? ''
        : translate('siteIconsUnavailable');

    if (changed) {
      eventTarget.dispatchEvent(new Event(FAVICON_SOURCES_CHANGED_EVENT));
    }
  }

  const controller = createFaviconPermissionController({
    permissions,
    onStateChange: render,
  });

  const handleConfigure = () => {
    if (!configure || !disclosure) return;
    const expanded = configure.getAttribute('aria-expanded') === 'true';
    configure.setAttribute('aria-expanded', String(!expanded));
    disclosure.hidden = expanded;
    if (!expanded) toggle.focus();
  };

  const handleToggle = () => {
    toggle.disabled = true;
    void (toggle.checked ? controller.enable() : controller.disable());
  };

  const handlePermissionChange = () => {
    void controller.refresh();
  };

  configure?.addEventListener('click', handleConfigure);
  toggle.addEventListener('change', handleToggle);
  permissions?.onAdded?.addListener?.(handlePermissionChange);
  permissions?.onRemoved?.addListener?.(handlePermissionChange);

  await controller.refresh();

  return {
    destroy() {
      configure?.removeEventListener('click', handleConfigure);
      toggle.removeEventListener('change', handleToggle);
      permissions?.onAdded?.removeListener?.(handlePermissionChange);
      permissions?.onRemoved?.removeListener?.(handlePermissionChange);
    },
  };
}
