// Development preview of the real shared UI. In-memory synthetic data only;
// no browser profiles, real extension storage, release archives or backend.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME_RELEASE_FILES } from './build-chrome.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicFiles = new Set(CHROME_RELEASE_FILES);
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const bootstrap = `
const locale = new URL(location.href).searchParams.get('lang') === 'ru' ? 'ru' : 'en';
const folderDemo = new URL(location.href).searchParams.get('demo') === 'folders';
const messages = await (await fetch('/_locales/' + locale + '/messages.json')).json();
const area = () => ({ data: {},
  async get(keys = null) { return keys === null ? structuredClone(this.data) : Object.fromEntries(
    (typeof keys === 'string' ? [keys] : keys).filter(key => Object.hasOwn(this.data, key)).map(key => [key, structuredClone(this.data[key])])); },
  async set(values) { Object.assign(this.data, structuredClone(values)); },
  async remove(keys) { for (const key of typeof keys === 'string' ? [keys] : keys) delete this.data[key]; },
});
globalThis.chrome = { storage: { sync: area(), local: area() },
  runtime: { getURL: path => new URL(path, location.origin + '/newtab.html').href },
  i18n: { getUILanguage: () => locale, getMessage: (key, args = []) => {
    if (key === '@@ui_locale') return locale;
    const entry = messages[key], values = Array.isArray(args) ? args : [args];
    return (entry?.message || '').replace(/\\$([a-z][a-z0-9_]*)\\$/gi, (_, id) =>
      Object.entries(entry.placeholders || {}).find(([name]) => name.toLowerCase() === id.toLowerCase())?.[1].content || '')
      .replace(/\\$(\\d+)/g, (_, i) => String(values[Number(i) - 1] ?? ''));
  } },
};
const { createStorageService } = await import('/storage-service.mjs');
const demoFolders = [{ id: 'root', name: 'Favorites' },
  ...['AI', 'Entertainment', 'Google', 'Job', 'Dev'].map((name, i) => ({ id: 'folder-' + i, name }))];
const popular = [ ['Google', 'https://www.google.com/'], ['GitHub', 'https://github.com/'],
  ['YouTube', 'https://www.youtube.com/'], ['ChatGPT', 'https://chatgpt.com/'], ['Reddit', 'https://reddit.com/'] ];
const demoLinks = demoFolders.slice(1).flatMap((folder, i) => Array.from({ length: [5, 9, 6, 13, 9][i] }, (_, n) => ({
  id: 'demo-' + i + '-' + n, title: popular[(i + n) % popular.length][0],
  url: popular[(i + n) % popular.length][1], folderId: folder.id,
})));
const saved = await createStorageService({ logger: null }).save({
  selectedFolderId: 'all', folders: [{ id: 'root', name: 'Favorites' }, { id: 'dev', name: 'Dev' }],
  links: [{ id: 'demo-github', title: 'GitHub', url: 'https://github.com/nurfinn/minimal-new-tab-extension/issues?tab=recent&filter=assigned', folderId: 'dev' }],
  background: { type: 'image', value: 'images/default-background.png', overlay: 0, overlayColor: '#17122b' }, shortcutsEnabled: true,
  ...(folderDemo ? { folders: demoFolders, links: demoLinks } : {}),
});
if (!saved.ok) throw new Error('Could not prepare synthetic preview');
await import('/newtab.js');
const show = () => {
  if (folderDemo) {
    if (!document.querySelector('#folderRow [data-folder]')) return setTimeout(show, 30);
    document.querySelector('#addFolderButton').click();
    return;
  }
  const edit = document.querySelector('[data-edit-link="demo-github"]');
  if (!edit) return setTimeout(show, 30);
  edit.click();
  document.querySelector('#linkIconButton').click();
};
show();
`;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/__preview_bootstrap.mjs') {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      return response.end(bootstrap);
    }
    const path = resolve(root, '.' + (url.pathname === '/' ? '/newtab.html' : decodeURIComponent(url.pathname)));
    if (!path.startsWith(root + sep)) throw new Error('Outside preview');
    if (!publicFiles.has(path.slice(root.length + 1).split(sep)[0])) throw new Error('Not a public extension file');
    let data = await readFile(path);
    if (path.endsWith('newtab.html')) data = data.toString().replace('src="newtab.js"', 'src="/__preview_bootstrap.mjs"');
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(data);
  } catch { response.writeHead(404); response.end(); }
});
server.listen(Number(process.env.PORT) || 0, '127.0.0.1', () => {
  console.log('Synthetic, memory-only preview: http://127.0.0.1:' + server.address().port + '/');
});
