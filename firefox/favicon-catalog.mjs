function simple(asset, slug, domains) {
  return Object.freeze({
    asset: `${asset}.svg`,
    source: `https://cdn.simpleicons.org/${slug}`,
    domains: Object.freeze(domains),
  });
}

function packaged(asset, source, domains) {
  return Object.freeze({
    asset,
    source,
    domains: Object.freeze(domains),
  });
}

export const ICON_DEFINITIONS = Object.freeze([
  simple('google', 'google', ['google.com']),
  simple('gmail', 'gmail', ['mail.google.com', 'gmail.com']),
  simple('google-drive', 'googledrive', ['drive.google.com']),
  simple('google-docs', 'googledocs', ['docs.google.com']),
  simple('google-sheets', 'googlesheets', ['sheets.google.com']),
  simple('google-slides', 'googleslides', ['slides.google.com']),
  simple('google-calendar', 'googlecalendar', ['calendar.google.com']),
  simple('google-meet', 'googlemeet', ['meet.google.com']),
  simple('google-maps', 'googlemaps', ['maps.google.com', 'googlemaps.com']),
  simple('google-photos', 'googlephotos', ['photos.google.com']),
  simple('google-translate', 'googletranslate', ['translate.google.com']),
  simple('youtube', 'youtube', ['youtube.com', 'youtu.be']),
  simple('google-cloud', 'googlecloud', ['cloud.google.com']),
  simple('google-analytics', 'googleanalytics', ['analytics.google.com']),
  simple('google-ads', 'googleads', ['ads.google.com']),
  simple('google-tag-manager', 'googletagmanager', ['tagmanager.google.com']),
  simple('google-search-console', 'googlesearchconsole', ['search.google.com']),
  simple('looker-studio', 'looker', ['lookerstudio.google.com']),
  packaged(
    'openai.png',
    'https://www.google.com/s2/favicons?domain=openai.com&sz=128',
    ['openai.com', 'chatgpt.com'],
  ),
  simple('anthropic', 'anthropic', ['anthropic.com', 'claude.ai']),
  simple('google-gemini', 'googlegemini', ['gemini.google.com']),
  simple('perplexity', 'perplexity', ['perplexity.ai']),
  packaged('grok.ico', 'https://grok.com/images/favicon.ico', ['grok.com']),
  simple('deepseek', 'deepseek', ['deepseek.com']),
  simple('mistral', 'mistralai', ['mistral.ai']),
  simple('hugging-face', 'huggingface', ['huggingface.co']),
  packaged(
    'midjourney.png',
    'https://www.google.com/s2/favicons?domain=midjourney.com&sz=128',
    ['midjourney.com'],
  ),
  simple('github-copilot', 'githubcopilot', ['copilot.github.com']),
  simple('poe', 'poe', ['poe.com']),
  simple('cursor', 'cursor', ['cursor.com']),
  simple('replit', 'replit', ['replit.com']),
  simple('reddit', 'reddit', ['reddit.com']),
  simple('facebook', 'facebook', ['facebook.com', 'fb.com']),
  simple('instagram', 'instagram', ['instagram.com']),
  simple('x', 'x', ['x.com', 'twitter.com']),
  packaged(
    'linkedin.ico',
    'https://static.licdn.com/aero-v1/sc/h/al2o9zrvru7aqj8e1x2rzsrca',
    ['linkedin.com'],
  ),
  simple('tiktok', 'tiktok', ['tiktok.com']),
  simple('pinterest', 'pinterest', ['pinterest.com']),
  simple('discord', 'discord', ['discord.com', 'discord.gg']),
  simple('telegram', 'telegram', ['telegram.org', 't.me']),
  simple('whatsapp', 'whatsapp', ['whatsapp.com', 'wa.me']),
  packaged(
    'slack.png',
    'https://a.slack-edge.com/e6a93c1/img/icons/favicon-32.png',
    ['slack.com'],
  ),
  simple('zoom', 'zoom', ['zoom.us']),
  simple('github', 'github', ['github.com', 'github.io']),
  simple('gitlab', 'gitlab', ['gitlab.com']),
  simple('vercel', 'vercel', ['vercel.com', 'vercel.app']),
  simple('railway', 'railway', ['railway.app']),
  simple('netlify', 'netlify', ['netlify.com', 'netlify.app']),
  simple('cloudflare', 'cloudflare', ['cloudflare.com']),
  simple('namecheap', 'namecheap', ['namecheap.com']),
  packaged(
    'aws.ico',
    'https://a0.awsstatic.com/libra-css/images/site/fav/favicon.ico',
    ['aws.amazon.com'],
  ),
  packaged(
    'azure.ico',
    'https://azure.microsoft.com/favicon.ico?v2',
    ['azure.microsoft.com', 'portal.azure.com'],
  ),
  simple('docker', 'docker', ['docker.com', 'hub.docker.com']),
  simple('npm', 'npm', ['npmjs.com']),
  simple('stack-overflow', 'stackoverflow', ['stackoverflow.com']),
  simple('supabase', 'supabase', ['supabase.com']),
  simple('firebase', 'firebase', ['firebase.google.com']),
  simple('notion', 'notion', ['notion.so', 'notion.site']),
  simple('figma', 'figma', ['figma.com']),
  packaged('canva.ico', 'https://www.canva.com/favicon.ico', ['canva.com']),
  simple('trello', 'trello', ['trello.com']),
  simple('asana', 'asana', ['asana.com']),
  simple('linear', 'linear', ['linear.app']),
  simple('jira', 'jira', ['atlassian.net', 'jira.com']),
  simple('webflow', 'webflow', ['webflow.com', 'webflow.io']),
  simple('dropbox', 'dropbox', ['dropbox.com']),
]);

const GOOGLE_PATH_RULES = Object.freeze([
  Object.freeze({ prefix: '/spreadsheets', asset: 'google-sheets.svg' }),
  Object.freeze({ prefix: '/presentation', asset: 'google-slides.svg' }),
  Object.freeze({ prefix: '/document', asset: 'google-docs.svg' }),
]);

function isMatchingDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function resolveLocalFavicon(value) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname === 'docs.google.com') {
    const pathRule = GOOGLE_PATH_RULES.find(({ prefix }) => url.pathname.startsWith(prefix));
    if (pathRule) return `site-icons/${pathRule.asset}`;
  }

  const matches = ICON_DEFINITIONS.flatMap((definition) =>
    definition.domains
      .filter((domain) => isMatchingDomain(hostname, domain))
      .map((domain) => ({ definition, domain })),
  ).sort((left, right) => right.domain.length - left.domain.length);

  return matches[0] ? `site-icons/${matches[0].definition.asset}` : null;
}
