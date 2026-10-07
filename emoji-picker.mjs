import { SITE_EMOJI_OPTIONS } from './site-icon.mjs';
import { isEmojiSupported } from './emoji-support.mjs';
import { EMOJI_CATEGORIES, createEmojiCatalogLoader, getEmojiLabel, getEmojiVariants,
  searchEmojiCatalog } from './emoji-catalog.mjs';

const BATCH_SIZE = 80;

export function createEmojiPicker({ root, t, locale, onSelect, loadCatalog = createEmojiCatalogLoader(), supportsEmoji = isEmojiSupported }) {
  const search = root.querySelector('#emojiSearch');
  const categories = root.querySelector('#emojiCategories');
  const grid = root.querySelector('#siteEmojiGrid');
  const heading = root.querySelector('#emojiResultsHeading');
  const status = root.querySelector('#emojiPickerStatus');
  const back = root.querySelector('#emojiVariantsBack');
  const retry = root.querySelector('#emojiRetry');
  let catalog, category = 'all', selected = '', variantsFor = '', items = [], rendered = 0, cursor = 0;
  let initialized = false, active = false, loading = false, failed = false, timer, scrollFrame, scanFrame;

  function fit() {
    root.style.transform = '';
    if (!active || getComputedStyle(root).position !== 'absolute') return;
    const box = root.getBoundingClientRect();
    const shift = Math.max(16 - box.top, Math.min(0, window.innerHeight - 16 - box.bottom));
    if (shift) root.style.transform = `translateY(${shift}px)`;
  }

  function setStatus(message = '') {
    status.textContent = message;
    status.hidden = !message;
    retry.hidden = !failed;
  }

  function updateSelection(value) {
    selected = value;
    grid.querySelectorAll('[data-site-emoji]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.siteEmoji === selected));
    });
  }

  function refreshStatus() {
    setStatus(failed ? t('emojiLoadFailed') : loading || (!rendered && cursor < items.length)
      ? t('emojiLoading') : !rendered && catalog
        ? t(items.length ? 'emojiUnavailable' : 'emojiNoResults') : '');
  }

  function appendBatch(target = rendered + BATCH_SIZE) {
    cancelAnimationFrame(scanFrame);
    scanFrame = undefined;
    const fragment = document.createDocumentFragment();
    // Probe only a bounded batch, not the entire catalog on every keystroke.
    // A device without emoji support can continue scanning between frames.
    let scanned = 0;
    while (cursor < items.length && rendered < target && scanned++ < BATCH_SIZE * 2) {
      const entry = items[cursor++];
      if (!supportsEmoji(entry.emoji)) continue;
      rendered++;
      const cell = document.createElement('div');
      cell.className = 'site-emoji-cell';
      const choice = document.createElement('button');
      choice.className = 'site-emoji-choice';
      choice.type = 'button';
      choice.dataset.siteEmoji = entry.emoji;
      choice.textContent = entry.emoji;
      const label = entry.labelKey ? t(entry.labelKey) : getEmojiLabel(entry, locale);
      choice.setAttribute('aria-label', label);
      choice.title = label;
      choice.setAttribute('aria-pressed', String(entry.emoji === selected));
      cell.append(choice);
      if (!variantsFor && catalog && getEmojiVariants(catalog, entry.emoji).length > 1) {
        const variants = document.createElement('button');
        variants.className = 'emoji-variants-button';
        variants.type = 'button';
        variants.dataset.emojiVariants = entry.emoji;
        const caret = document.createElement('span');
        caret.className = 'emoji-variants-icon';
        caret.setAttribute('aria-hidden', 'true');
        variants.append(caret);
        variants.setAttribute('aria-label', t('emojiVariantsFor', [label]));
        variants.title = t('emojiVariantsFor', [label]);
        cell.append(variants);
      }
      fragment.append(cell);
    }
    grid.append(fragment);
    if (rendered < target && cursor < items.length) {
      scanFrame = requestAnimationFrame(() => { if (active) appendBatch(target); });
    }
    refreshStatus();
    fit();
  }

  function render() {
    if (!active) return;
    const focused = grid.contains(document.activeElement) ? document.activeElement.dataset.siteEmoji : '';
    const query = search.value.trim();
    for (const button of categories.children) {
      button.setAttribute('aria-pressed', String(!query && button.dataset.emojiCategory === category));
    }
    back.hidden = !variantsFor;
    if (variantsFor && catalog) {
      items = getEmojiVariants(catalog, variantsFor);
      heading.textContent = t('emojiVariants');
    } else if (query && catalog) {
      items = searchEmojiCatalog(catalog, { query });
      heading.textContent = t('emojiSearchResults');
    } else {
      // The small built-in set is for damaged/missing catalog recovery only.
      // In normal use All contains every supported base emoji, in Unicode order.
      items = catalog ? searchEmojiCatalog(catalog, { category })
        : failed && category === 'all' ? SITE_EMOJI_OPTIONS : [];
      heading.textContent = t(EMOJI_CATEGORIES.find(c => c.id === category).labelKey);
    }
    // Keep the selected tone visible in ordinary category browsing.
    if (!query && !variantsFor && catalog?.byEmoji.has(selected) && supportsEmoji(selected)) {
      const current = catalog.byEmoji.get(selected);
      items = items.map(entry => entry.base === current.base ? current : entry);
      // A saved choice must be visible on reopen without mounting hundreds of
      // earlier entries. Keep the rest of the category in its original order.
      const index = items.findIndex(entry => entry.emoji === selected);
      if (index >= BATCH_SIZE) items = [current, ...items.filter(entry => entry !== current)];
    }
    grid.replaceChildren();
    grid.scrollTop = 0;
    rendered = 0;
    cursor = 0;
    appendBatch();
    if (focused) [...grid.querySelectorAll('[data-site-emoji]')]
      .find(button => button.dataset.siteEmoji === focused)?.focus({ preventScroll: true });
    refreshStatus();
    fit();
  }

  async function ensureCatalog() {
    if (catalog || loading) return;
    loading = true;
    failed = false;
    render();
    try {
      catalog = await loadCatalog();
      if (!search.value && category === 'all' && selected && catalog.byEmoji.has(selected)) {
        category = catalog.byEmoji.get(selected).category;
      }
    } catch { failed = true; }
    finally { loading = false; render(); }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    window.addEventListener('resize', fit);
    for (const entry of EMOJI_CATEGORIES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'emoji-category';
      button.dataset.emojiCategory = entry.id;
      const icon = document.createElement('span');
      icon.className = 'emoji-category-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.style.maskImage = `url("${new URL(`./icons/emoji-ui/${entry.icon}.svg`, import.meta.url)}")`;
      button.append(icon);
      button.title = t(entry.labelKey);
      button.setAttribute('aria-label', t(entry.labelKey));
      button.setAttribute('aria-pressed', 'false');
      categories.append(button);
    }
    categories.addEventListener('click', event => {
      const button = event.target.closest('[data-emoji-category]');
      if (!button) return;
      clearTimeout(timer);
      category = button.dataset.emojiCategory;
      search.value = '';
      variantsFor = '';
      render();
      void ensureCatalog();
    });
    search.addEventListener('input', () => {
      variantsFor = '';
      clearTimeout(timer);
      timer = setTimeout(render, 80);
    });
    // Grow only the results, leaving search, categories and the footer fixed.
    // Keyboard navigation can also append a batch; no separate "More" step.
    grid.addEventListener('scroll', () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = undefined;
        if (active && cursor < items.length && grid.scrollHeight - grid.clientHeight - grid.scrollTop < 72) {
          appendBatch();
        }
      });
    }, { passive: true });
    retry.addEventListener('click', () => { void ensureCatalog(); });
    back.addEventListener('click', () => {
      const previous = variantsFor;
      variantsFor = '';
      render();
      [...grid.querySelectorAll('[data-emoji-variants]')]
        .find(button => button.dataset.emojiVariants === previous)?.focus({ preventScroll: true });
    });
    grid.addEventListener('click', event => {
      const variants = event.target.closest('[data-emoji-variants]');
      if (variants) {
        variantsFor = variants.dataset.emojiVariants;
        render();
        grid.querySelector('[data-site-emoji]')?.focus();
        return;
      }
      const choice = event.target.closest('[data-site-emoji]');
      if (choice) onSelect(choice.dataset.siteEmoji);
    });
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && variantsFor) {
        event.preventDefault();
        event.stopPropagation();
        back.click();
        return;
      }
      if (event.target === search) {
        if (event.key === 'Enter') event.preventDefault();
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          grid.querySelector('[data-site-emoji]')?.focus();
        }
        return;
      }
      const inCategories = categories.contains(event.target);
      const selector = inCategories ? '[data-emoji-category]' : '[data-site-emoji]';
      const button = event.target.closest(selector);
      if (!button) return;
      let buttons = [...(inCategories ? categories : grid).querySelectorAll(selector)];
      const index = buttons.indexOf(button);
      const columns = inCategories ? 1 : getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      const next = { ArrowLeft: index - 1, ArrowRight: index + 1,
        ArrowUp: index - columns, ArrowDown: index + columns, Home: 0, End: buttons.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      if (!inCategories && next >= rendered && cursor < items.length) {
        appendBatch();
        buttons = [...grid.querySelectorAll(selector)];
      }
      buttons[Math.max(0, Math.min(next, buttons.length - 1))]?.focus();
    });
  }

  return {
    open(value = '') {
      init();
      active = true;
      selected = value;
      category = catalog?.byEmoji.has(value) ? catalog.byEmoji.get(value).category : 'all';
      search.value = '';
      variantsFor = '';
      render();
      void ensureCatalog();
    },
    close() {
      active = false; clearTimeout(timer);
      cancelAnimationFrame(scrollFrame); cancelAnimationFrame(scanFrame);
      scrollFrame = scanFrame = undefined;
    },
    updateSelection,
  };
}
