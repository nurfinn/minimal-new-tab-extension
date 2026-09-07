export function buildFaviconSources(value, runtime = globalThis.chrome?.runtime) {
  let pageUrl;
  try {
    pageUrl = new URL(value);
  } catch {
    return [];
  }

  if (!['http:', 'https:'].includes(pageUrl.protocol) || !pageUrl.hostname) {
    return [];
  }

  const sources = [];

  const googleFaviconUrl = new URL('https://www.google.com/s2/favicons');
  googleFaviconUrl.searchParams.set('domain', pageUrl.hostname);
  googleFaviconUrl.searchParams.set('sz', '64');
  sources.push(googleFaviconUrl.href);

  if (typeof runtime?.getURL === 'function') {
    const chromeFaviconUrl = new URL(runtime.getURL('/_favicon/'));
    chromeFaviconUrl.searchParams.set('pageUrl', pageUrl.href);
    chromeFaviconUrl.searchParams.set('size', '64');
    sources.push(chromeFaviconUrl.href);
  }

  return [...new Set(sources)];
}
