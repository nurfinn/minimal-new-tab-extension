import { resolveLocalFavicon } from './favicon-catalog.mjs';

let remoteFaviconLoadingEnabled = false;

export function setRemoteFaviconLoading(enabled) {
  const next = enabled === true;
  const changed = next !== remoteFaviconLoadingEnabled;
  remoteFaviconLoadingEnabled = next;
  return changed;
}

export function isRemoteFaviconLoadingEnabled() {
  return remoteFaviconLoadingEnabled;
}

export function buildFaviconSources(value) {
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
  const localSource = resolveLocalFavicon(pageUrl);
  if (localSource) sources.push(localSource);

  if (remoteFaviconLoadingEnabled) {
    const hostname = pageUrl.hostname.toLowerCase().replace(/\.$/, '');
    sources.push(`https://${hostname}/favicon.ico`);

    const googleSource = new URL('https://www.google.com/s2/favicons');
    googleSource.searchParams.set('domain', hostname);
    googleSource.searchParams.set('sz', '64');
    sources.push(googleSource.href);
  }

  return [...new Set(sources)];
}
