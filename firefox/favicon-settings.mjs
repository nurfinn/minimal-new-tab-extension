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
});

export function createFaviconPermissionController({
  permissions,
  onStateChange = () => {},
} = {}) {
  let state = OFF_STATE;

  function publish(next) {
    state = Object.freeze(next);
    onStateChange(state);
    return state;
  }

  async function refresh() {
    if (typeof permissions?.getAll !== 'function') {
      return publish({ supported: false, enabled: false, error: false });
    }

    try {
      const granted = await permissions.getAll();
      if (!Array.isArray(granted?.data_collection)) {
        return publish({ supported: false, enabled: false, error: false });
      }

      return publish({
        supported: true,
        enabled: granted.data_collection.includes('browsingActivity'),
        error: false,
      });
    } catch {
      return publish({ supported: true, enabled: false, error: true });
    }
  }

  async function enable() {
    if (typeof permissions?.request !== 'function') {
      return publish({ supported: false, enabled: false, error: false });
    }

    try {
      const granted = await permissions.request(FAVICON_DATA_PERMISSION);
      return granted
        ? refresh()
        : publish({ supported: true, enabled: false, error: false });
    } catch {
      return publish({ supported: true, enabled: false, error: true });
    }
  }

  async function disable() {
    if (typeof permissions?.remove !== 'function') {
      return publish({ supported: false, enabled: false, error: false });
    }

    try {
      await permissions.remove(FAVICON_DATA_PERMISSION);
      return refresh();
    } catch {
      return publish({ supported: true, enabled: false, error: true });
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

  if (!configure || !disclosure || !toggle || !mode || !status || !error) {
    setRemoteFaviconLoading(false);
    return { destroy() {} };
  }

  function render(next) {
    const changed = setRemoteFaviconLoading(next.enabled);
    toggle.checked = next.enabled;
    toggle.disabled = !next.supported;
    mode.textContent = translate(
      next.enabled ? 'siteIconsLocalRemote' : 'siteIconsLocalOnly',
    );
    status.textContent = translate(next.enabled ? 'siteIconsOn' : 'siteIconsOff');
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

  configure.addEventListener('click', handleConfigure);
  toggle.addEventListener('change', handleToggle);
  permissions?.onAdded?.addListener?.(handlePermissionChange);
  permissions?.onRemoved?.addListener?.(handlePermissionChange);

  await controller.refresh();

  return {
    destroy() {
      configure.removeEventListener('click', handleConfigure);
      toggle.removeEventListener('change', handleToggle);
      permissions?.onAdded?.removeListener?.(handlePermissionChange);
      permissions?.onRemoved?.removeListener?.(handlePermissionChange);
    },
  };
}
