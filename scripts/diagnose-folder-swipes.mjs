// QA only: builds an isolated extension and records bounded, numeric gesture
// diagnostics. Never packaged or injected into a personal browser profile.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildChromeRelease } from './build-chrome.mjs';

export function createTraceBuffer({ now = () => performance.now(), limit = 5000, durationMs = 60000 } = {}) {
  let active = false, started = 0, reason = 'idle', events = [];
  const numeric = ['deltaX', 'deltaY', 'deltaMode', 'buttons', 'eventTime', 'selected',
    'selectedAfter', 'direction', 'guardMask', 'gap', 'distance', 'verticalDistance',
    'lastMagnitude', 'recontactCount', 'recontactX', 'deliveryMs', 'handlerMs',
    'recognizerMs', 'frameOpportunityMs', 'durationMs'];
  const boolean = ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'cancelable', 'defaultPrevented',
    'contentSeen', 'consume', 'blocked', 'triggered', 'guarded', 'suppressed',
    'targetConnected', 'saving', 'pending'];
  function sanitize(value, nested = false) {
    const clean = {};
    for (const key of numeric) if (Number.isFinite(value?.[key])) clean[key] = value[key];
    for (const key of boolean) if (typeof value?.[key] === 'boolean') clean[key] = value[key];
    if (['card', 'content', 'header', 'dialog', 'field', 'other'].includes(value?.target)) clean.target = value.target;
    if (['none', 'horizontal', 'blocked'].includes(value?.axis)) clean.axis = value.axis;
    if (!nested) for (const key of ['before', 'after']) {
      if (value?.[key] && typeof value[key] === 'object') clean[key] = sanitize(value[key], true);
    }
    return clean;
  }
  const api = {
    start() { events = []; started = now(); reason = 'recording'; active = true; },
    stop(why = 'manual') { if (active) { active = false; reason = why; } },
    push(value) {
      if (!active) return;
      if (now() - started >= durationMs) { api.stop('timeout'); return; }
      if (!['wheel', 'selection', 'frame', 'longtask', 'marker'].includes(value?.kind)) return;
      events.push({ kind: value.kind, elapsed: now() - started, ...sanitize(value) });
      if (events.length >= limit) api.stop('limit');
    },
    get active() { return active; },
    snapshot() { return { reason, events: structuredClone(events) }; },
  };
  return api;
}

function replaceOnce(source, anchor, replacement) {
  if (source.split(anchor).length !== 2) throw new Error(`Diagnostic anchor mismatch: ${anchor}`);
  return source.replace(anchor, replacement);
}

export function instrumentRecognizer(source) {
  const anchor = '  let recontact = null;';
  return replaceOnce(source, anchor, `${anchor}
  globalThis.__folderSwipeQA?.attachState(() => ({
    distance, verticalDistance, triggered, axis: axis ?? 'none', lastEventTime,
    lastMagnitude, guarded, suppressed,
    recontactCount: recontact?.count ?? 0, recontactX: recontact?.x ?? 0
  }));`);
}

function installBrowserDiagnostics(createBuffer) {
  const trace = createBuffer();
  let stateReader = () => ({}), contextReader = () => ({}), current = null;
  let epoch = 0, timeout, flushing = false, status, startButton, stopButton;
  const selection = () => [...document.querySelectorAll('[data-folder]')]
    .findIndex((node) => node.getAttribute('aria-pressed') === 'true');
  const category = (node) => node?.closest?.('dialog') ? 'dialog'
    : node?.closest?.('input,textarea,select,[contenteditable]') ? 'field'
    : node?.closest?.('.link-card') ? 'card' : node?.closest?.('.content') ? 'content'
    : node?.closest?.('#folderRow,.toolbar') ? 'header' : 'other';
  const stateAt = (time) => {
    const value = stateReader();
    return { ...value, gap: value.lastEventTime === null ? -1 : time - value.lastEventTime };
  };
  async function finish(reason = 'manual') {
    if (flushing || !startButton || startButton.disabled === false) return;
    flushing = true;
    clearTimeout(timeout);
    trace.stop(reason);
    stopButton.disabled = true;
    status.textContent = 'Сохраняю запись…';
    try {
      await window.__saveSwipeDiagnostic(trace.snapshot());
      status.textContent = `Запись сохранена (${trace.snapshot().events.length} событий). Сообщи, была ли задержка.`;
    } catch {
      status.textContent = 'Не удалось сохранить запись. Сообщи об этом в чат.';
    }
    startButton.disabled = false;
    flushing = false;
  }
  function record(value) {
    trace.push(value);
    if (!trace.active && startButton?.disabled && !flushing) void finish();
  }
  globalThis.__folderSwipeQA = {
    attachState(reader) { stateReader = reader; },
    attach(recognizer, reader) {
      contextReader = reader;
      const handle = recognizer.handle.bind(recognizer);
      const block = recognizer.block.bind(recognizer);
      recognizer.handle = (event, options) => {
        const started = performance.now();
        if (current) Object.assign(current, { contentSeen: true, blocked: Boolean(options?.blocked) });
        const result = handle(event, options);
        const recognizerMs = performance.now() - started;
        if (current) Object.assign(current, result, { recognizerMs, after: stateAt(event.timeStamp) });
        return result;
      };
      recognizer.block = (time) => {
        block(time);
        if (current) Object.assign(current, { blocked: true, after: stateAt(time) });
      };
    },
    guards(mask) { if (current) current.guardMask = mask; },
    measureHandler(event, run) {
      const entry = current;
      if (!trace.active || !entry) return run();
      const started = performance.now();
      try { return run(); }
      finally {
        const completed = performance.now();
        entry.handlerMs = completed - started;
        if (entry.direction && selection() !== entry.selected) {
          const selected = selection();
          const captureEpoch = epoch;
          // This is the next animation-frame opportunity, NOT proof that pixels
          // have been composited or displayed by the OS.
          requestAnimationFrame(() => {
            if (trace.active && epoch === captureEpoch) record({ kind: 'frame',
              eventTime: event.timeStamp - epoch, selected,
              frameOpportunityMs: performance.now() - completed });
          });
        }
      }
    },
  };
  document.addEventListener('wheel', (event) => {
    if (!trace.active) return;
    const entry = {
      kind: 'wheel', eventTime: event.timeStamp - epoch,
      deliveryMs: Math.max(0, performance.now() - event.timeStamp),
      deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode,
      buttons: event.buttons, ctrlKey: event.ctrlKey, metaKey: event.metaKey,
      altKey: event.altKey, shiftKey: event.shiftKey, cancelable: event.cancelable,
      target: category(event.target), contentSeen: false, selected: selection(),
      before: stateAt(event.timeStamp), ...contextReader(),
    };
    current = entry;
    // Trusted browser events can run microtasks between listener callbacks.
    // Read the result in the next task, after the content handler has run.
    setTimeout(() => {
      Object.assign(entry, { defaultPrevented: event.defaultPrevented,
        targetConnected: Boolean(event.target.isConnected), selectedAfter: selection() });
      record(entry);
      if (current === entry) current = null;
    }, 0);
  }, { capture: true, passive: true });

  // Explicit Space marker only while recording over the normal page. No other
  // keys, typed text, DOM text or long-task attribution are collected.
  document.addEventListener('keydown', (event) => {
    if (!trace.active || event.code !== 'Space' || event.repeat || event.ctrlKey ||
        event.metaKey || event.altKey || event.shiftKey ||
        document.querySelector('dialog[open]') ||
        event.target.closest?.('input,textarea,select,button,a,[contenteditable]')) return;
    event.preventDefault();
    record({ kind: 'marker' });
    status.textContent = 'Задержка отмечена. Продолжай или нажми «Завершить».';
  });
  if (globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
    new PerformanceObserver((list) => {
      if (!trace.active) return;
      for (const entry of list.getEntries()) {
        if (entry.startTime >= epoch) record({ kind: 'longtask',
          eventTime: entry.startTime - epoch, durationMs: entry.duration });
      }
    }).observe({ type: 'longtask' });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const row = document.getElementById('folderRowTrack');
    if (!row) return;
    document.title = 'Свайпы — проверка быстрых серий';
    const panel = document.createElement('aside');
    panel.id = 'swipe-diagnostic-panel';
    panel.style.cssText = 'position:fixed;right:18px;bottom:28px;z-index:10000;width:310px;padding:16px;background:#fff;color:#152b28;border:1px solid #aaa;border-radius:12px;font:14px/1.4 system-ui;box-shadow:0 4px 24px #0005';
    const heading = document.createElement('strong');
    heading.textContent = 'Проверка быстрых серий';
    const instructions = document.createElement('p');
    instructions.textContent = 'Начни запись и наведи указатель на карточки. Сделай два быстрых свайпа в одну сторону, два обратно; повтори три раза без тапов и длинных пауз. Во время серии ничего нажимать не нужно. После серии нажми «Завершить».';
    startButton = document.createElement('button');
    startButton.id = 'start-swipe-diagnostic';
    startButton.textContent = 'Начать запись';
    stopButton = document.createElement('button');
    stopButton.id = 'stop-swipe-diagnostic';
    stopButton.textContent = 'Завершить';
    stopButton.disabled = true;
    for (const button of [startButton, stopButton]) {
      button.type = 'button';
      button.style.cssText = 'font:inherit;padding:8px 10px;margin:0 6px 8px 0';
    }
    status = document.createElement('div');
    status.id = 'swipe-diagnostic-status';
    status.textContent = 'Запись выключена. Только синтетические сайты; максимум 60 секунд.';
    status.setAttribute('aria-live', 'polite');
    startButton.onclick = () => {
      epoch = performance.now();
      trace.start();
      startButton.disabled = true;
      stopButton.disabled = false;
      startButton.blur();
      status.textContent = 'Запись идёт. После жестов нажми «Завершить».';
      timeout = setTimeout(() => finish('timeout'), 60_000);
    };
    stopButton.onclick = () => finish('manual');
    panel.append(heading, instructions, startButton, stopButton, status);
    document.body.append(panel);
    let previous = selection();
    new MutationObserver(() => {
      const selected = selection();
      if (selected !== previous) { record({ kind: 'selection', selected }); previous = selected; }
    }).observe(row, { attributes: true, childList: true, subtree: true, attributeFilter: ['aria-pressed'] });
  }, { once: true });
}

async function main() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const parent = process.env.SWIPE_DIAGNOSTIC_OUTPUT || tmpdir();
  await mkdir(parent, { recursive: true });
  const output = await mkdtemp(join(parent, 'capture-'));
  const extension = join(output, 'chrome');
  await buildChromeRelease({ sourceRoot: root, outputDir: extension,
    archivePath: join(output, 'chrome-uninstrumented-qa.zip') });
  const original = await readFile(join(extension, 'newtab.js'), 'utf8');
  const recognizer = await readFile(join(extension, 'folder-gestures.mjs'), 'utf8');
  let instrumented = replaceOnce(original, '\ninit();', `
globalThis.__folderSwipeQA?.attach(folderGesture, () => ({
  saving: Boolean(folderSelectionSaveInFlight), pending: Boolean(pendingFolderSelection)
}));
const qaHandleContentWheel = handleContentWheel;
handleContentWheel = (event) => globalThis.__folderSwipeQA.measureHandler(event, () => qaHandleContentWheel(event));
init();`);
  const handleAnchor = '  const { consume, direction } = folderGesture.handle(event, { blocked });';
  instrumented = replaceOnce(instrumented, handleAnchor, `  globalThis.__folderSwipeQA?.guards(
    Number(Boolean(dragState)) | Number(Boolean(folderDragState)) << 1 |
    Number(Boolean(event.buttons)) << 2 | Number(event.defaultPrevented) << 3 |
    Number(Boolean(document.querySelector("dialog[open]"))) << 4 |
    Number(Boolean(event.target.closest?.(editable))) << 5 |
    Number(Boolean(document.activeElement?.closest?.(editable))) << 6
  );
${handleAnchor}`);
  // Mechanical instrumentation of generated QA copies only, never the source.
  await writeFile(join(extension, 'newtab.js'), instrumented);
  await writeFile(join(extension, 'folder-gestures.mjs'), instrumentRecognizer(recognizer));
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const smoke = process.argv.includes('--smoke');
  const context = await chromium.launchPersistentContext(join(output, 'profile'), {
    channel: 'chromium', headless: smoke, viewport: { width: 1380, height: 880 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--window-size=1380,960'],
  });
  let captures = 0;
  const errors = [];
  try {
    const icon = await readFile(join(root, 'icons/icon-48.png'));
    await context.route(/^https?:/, (route) => route.request().url().startsWith('https://www.google.com/s2/favicons?')
      ? route.fulfill({ status: 200, contentType: 'image/png', body: icon }) : route.abort());
    await context.addInitScript({ content: `(${installBrowserDiagnostics.toString()})(${createTraceBuffer.toString()});` });
    const page = context.pages()[0] || await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    let extensionUrl;
    await page.exposeBinding('__saveSwipeDiagnostic', async ({ frame }, trace) => {
      if (frame !== page.mainFrame() || frame.url() !== extensionUrl) throw new Error('Not the QA page');
      const path = join(output, `trace-${String(++captures).padStart(3, '0')}.json`);
      await writeFile(path, JSON.stringify({ schema: 1, syntheticSites: true,
        sourceHash: createHash('sha256').update(original).digest('hex'),
        recognizerHash: createHash('sha256').update(recognizer).digest('hex'), ...trace }, null, 2));
      console.log(`CAPTURE SAVED: ${path}; ${trace.events.length} events, ${trace.reason}`);
    });
    await page.goto('chrome://newtab/');
    await page.locator('[data-folder="all"]').waitFor();
    extensionUrl = await page.evaluate(() => chrome.runtime.getURL('newtab.html'));
    // Explicit extension URL also makes the capture-origin check deterministic.
    await page.goto(extensionUrl);
    await page.locator('[data-folder="all"]').waitFor();
    await page.evaluate(async () => {
      const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
      const seed = {
        selectedFolderId: 'folder-2', shortcutsEnabled: true,
        folders: [{ id: 'root', name: 'Favorites' }, ...Array.from({ length: 7 }, (_, i) => ({ id: `folder-${i}`, name: `Folder ${i + 1}` }))],
        links: Array.from({ length: 84 }, (_, i) => ({ id: `site-${i}`, title: `Site ${i + 1}`,
          url: `https://example.com/${i}`, folderId: `folder-${Math.floor(i / 12)}` })),
        background: { type: 'image', value: 'images/default-background.png', overlay: 0, overlayColor: '#17122b' },
      };
      if (!(await createStorageService({ logger: null }).save(seed)).ok) throw new Error('QA seed failed');
    });
    await page.reload();
    await page.locator('[data-folder="folder-2"][aria-pressed="true"]').waitFor();
    await page.locator('#start-swipe-diagnostic').waitFor();
    if (smoke) {
      await page.locator('#start-swipe-diagnostic').click();
      await page.keyboard.press('Space');
      await page.locator('.link-card').first().hover();
      await page.mouse.wheel(120, 0);
      await page.locator('[data-folder="folder-3"][aria-pressed="true"]').waitFor();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.locator('#stop-swipe-diagnostic').click();
      await page.waitForFunction(() => document.querySelector('#swipe-diagnostic-status').textContent.startsWith('Запись сохранена'));
      const saved = JSON.parse(await readFile(join(output, 'trace-001.json'), 'utf8'));
      assert.equal(saved.recognizerHash, createHash('sha256').update(recognizer).digest('hex'));
      const wheel = saved.events.find((e) => e.kind === 'wheel' && e.direction === 1);
      assert.ok(wheel?.contentSeen && wheel.consume && !wheel.blocked);
      assert.equal(wheel.before.triggered, false);
      assert.equal(wheel.after.triggered, true);
      assert.equal(wheel.guardMask, 0);
      assert.ok(Number.isFinite(wheel.handlerMs) && wheel.handlerMs >= 0);
      assert.ok(Number.isFinite(wheel.recognizerMs) && wheel.recognizerMs >= 0);
      assert.ok(Number.isFinite(wheel.deliveryMs) && wheel.deliveryMs >= 0);
      assert.ok(saved.events.some((e) => e.kind === 'frame' && e.frameOpportunityMs >= 0));
      assert.ok(saved.events.some((e) => e.kind === 'marker'));
      assert.ok(saved.events.some((e) => e.kind === 'selection'));
      assert.equal(saved.events.some((e) => 'url' in e || 'title' in e), false);
      assert.deepEqual(errors, []);
      console.log(`SMOKE PASS: buffer, instrumentation, real extension wheel, selection, capture origin and save. ${output}`);
    } else {
      await page.bringToFront();
      await page.screenshot({ path: join(output, 'ready.png') });
      await writeFile(join(output, 'ready.json'), JSON.stringify({ extensionUrl, output, syntheticSites: true }, null, 2));
      console.log(`READY: ${output}. Recording is OFF until Start; personal profiles untouched.`);
      await new Promise((done) => context.once('close', done));
    }
  } finally {
    await context.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
