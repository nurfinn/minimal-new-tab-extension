export function getExtensionApi({
  browserApi = globalThis.browser,
  chromeApi = globalThis.chrome,
} = {}) {
  return browserApi ?? chromeApi ?? null;
}
