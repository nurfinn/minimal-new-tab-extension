import {
  buildFaviconSources,
  deriveTitleFromUrl,
  getFolderRevealScrollLeft,
  getFolderScrollState,
  getFolderWheelScrollLeft,
  getGlobalShortcutAction,
  getWheelScrollDelta,
  isUsableFavicon,
  moveItemByDelta,
  normalizeLegacyColorBackground,
  renameFolder,
  validateBackgroundImage,
  validateFolderName,
  validateSiteDraft
} from "./newtab-core.mjs";
import {
  MAX_BACKUP_BYTES,
  buildImportedState,
  getBackupFilename,
  parseBackupText,
  serializeBackup
} from "./backup-service.mjs";
import { createStorageService, normalizeWebUrl } from "./storage-service.mjs";
import { createTranslator, getUiLocale, localizeDocument } from "./i18n-service.mjs";
import { createFolderGestureRecognizer, getAdjacentFolderId } from "./folder-gestures.mjs";
import { SITE_EMOJI_OPTIONS, normalizeSiteEmoji } from "./site-icon.mjs";
import { createSettingsDraft, restoreDefaultBackground } from "./settings-draft.mjs";

const ROOT_FOLDER_ID = "root";
const FOLDER_SELECTION_SAVE_DELAY_MS = 1100;
const FOLDER_SELECTION_RETRY_DELAY_MS = 60_000;
const t = createTranslator();
const uiLocale = getUiLocale();
localizeDocument(document, t, uiLocale);

const defaultState = {
  selectedFolderId: "all",
  folders: [
    {
      id: ROOT_FOLDER_ID,
      name: t("favoriteFolder")
    }
  ],
  links: [
    {
      id: "default-google",
      title: "Google",
      url: "https://www.google.com/",
      folderId: ROOT_FOLDER_ID
    },
    {
      id: "default-youtube",
      title: "YouTube",
      url: "https://www.youtube.com/",
      folderId: ROOT_FOLDER_ID
    },
    {
      id: "default-gmail",
      title: "Gmail",
      url: "https://mail.google.com/",
      folderId: ROOT_FOLDER_ID
    },
    {
      id: "default-chatgpt",
      title: "ChatGPT",
      url: "https://chatgpt.com/",
      folderId: ROOT_FOLDER_ID
    },
    {
      id: "default-github",
      title: "GitHub",
      url: "https://github.com/",
      folderId: ROOT_FOLDER_ID
    }
  ],
  shortcutsEnabled: true,
  background: {
    type: "image",
    value: "images/default-background.png",
    overlay: 0,
    overlayColor: "#17122b"
  }
};

let state = structuredClone(defaultState);
let editingLinkId = null;
let renamingFolderId = null;
let savingFolderRenameId = null;
let folderRenameFocusRequest = null;
let dragState = null;
let folderDragState = null;
let suppressLinkClicksUntil = 0;
let activeSettingsTab = "background";
let settingsDraft = null;
let backgroundPreviewUrl = null;
let backgroundFileEpoch = 0;
let backgroundFileError = null;
let pendingBackgroundSelection = null;
let savingBackground = false;
let pendingImport = null;
let pendingDeleteConfirmation = null;
let deleteConfirmationReturnFocus = null;
let renderedFolderSelection = null;
let renderedFolderStructure = null;
// Keep decoded icons with their cards for this tab's lifetime. Entries are
// released when a site changes/disappears or the favicon permission changes.
const linkCardCache = new Map();
let folderScrollFrame = null;
let folderFocusRequest = null;
let pendingFolderScrollOptions = {};
let appStatusTimer = null;
let pendingFolderSelection = null;
let folderSelectionSaveTimer = null;
let folderSelectionSaveInFlight = null;
let folderSelectionRevision = 0;
let pendingLinkEmoji = "";
let linkIconPreviewTimer = null;
let linkIconPreviewEpoch = 0;
const folderGesture = createFolderGestureRecognizer();

let updateInputLocked = false;
let updateAppReady = false;
let activeUpdateOperations = 0;
// Neutral lifecycle contract; only the Chrome bootstrap consumes it.
export const updateSafety = {
  getBlockReason() {
    if (!updateAppReady) return "initializing";
    if (document.querySelector("dialog[open]")) return "dialog";
    if (savingFolderRenameId !== null) return "editing";
    if (dragState || folderDragState) return "drag";
    if (activeUpdateOperations || savingBackground) return "saving";
    if (pendingFolderSelection || folderSelectionSaveInFlight) return "selection";
    return null;
  },
  setInputLocked(locked) {
    updateInputLocked = Boolean(locked);
    document.querySelectorAll(".shell, body > footer, dialog").forEach(node => { node.inert = updateInputLocked; });
  }
};

async function trackUpdateOperation(action) {
  if (updateInputLocked) return false;
  activeUpdateOperations += 1;
  try { return await action(); }
  finally { activeUpdateOperations -= 1; }
}

const elements = {
  content: document.querySelector(".content"),
  folderRow: document.getElementById("folderRow"),
  folderRowTrack: document.getElementById("folderRowTrack"),
  linksGrid: document.getElementById("linksGrid"),
  emptyState: document.getElementById("emptyState"),
  appStatus: document.getElementById("appStatus"),
  reorderStatus: document.getElementById("reorderStatus"),
  addLinkButton: document.getElementById("addLinkButton"),
  addFolderButton: document.getElementById("addFolderButton"),
  settingsButton: document.getElementById("settingsButton"),
  linkDialog: document.getElementById("linkDialog"),
  deleteConfirmDialog: document.getElementById("deleteConfirmDialog"),
  deleteConfirmMessage: document.getElementById("deleteConfirmMessage"),
  confirmDeleteButton: document.getElementById("confirmDeleteButton"),
  cancelDeleteButton: document.getElementById("cancelDeleteButton"),
  cancelDeleteConfirmButtons: document.querySelectorAll("[data-cancel-delete-confirm]"),
  folderDialog: document.getElementById("folderDialog"),
  settingsDialog: document.getElementById("settingsDialog"),
  settingsTabs: document.querySelectorAll("[data-settings-tab]"),
  backgroundSettingsPanel: document.getElementById("backgroundSettingsPanel"),
  backupSettingsPanel: document.getElementById("backupSettingsPanel"),
  linkForm: document.getElementById("linkForm"),
  linkDialogTitle: document.getElementById("linkDialogTitle"),
  linkSubmitButton: document.getElementById("linkSubmitButton"),
  deleteLinkButton: document.getElementById("deleteLinkButton"),
  folderForm: document.getElementById("folderForm"),
  folderManager: document.getElementById("folderManager"),
  folderList: document.getElementById("folderList"),
  backgroundForm: document.getElementById("backgroundForm"),
  backgroundFields: document.getElementById("backgroundFields"),
  changeBackgroundImageButton: document.getElementById("changeBackgroundImageButton"),
  saveBackgroundButton: document.getElementById("saveBackgroundButton"),
  settingsGeneralActions: document.getElementById("settingsGeneralActions"),
  settingsBackupActions: document.getElementById("settingsBackupActions"),
  linkTitle: document.getElementById("linkTitle"),
  linkUrl: document.getElementById("linkUrl"),
  linkIconPreview: document.getElementById("linkIconPreview"),
  linkIconPreviewImage: document.getElementById("linkIconPreviewImage"),
  linkIconPreviewLetter: document.getElementById("linkIconPreviewLetter"),
  linkIconPreviewEmoji: document.getElementById("linkIconPreviewEmoji"),
  linkIconButton: document.getElementById("linkIconButton"),
  linkIconPicker: document.getElementById("linkIconPicker"),
  linkIconAuto: document.getElementById("linkIconAuto"),
  linkIconAutoPreview: document.getElementById("linkIconAutoPreview"),
  linkIconAutoImage: document.getElementById("linkIconAutoImage"),
  linkIconAutoLetter: document.getElementById("linkIconAutoLetter"),
  siteEmojiGrid: document.getElementById("siteEmojiGrid"),
  linkFolder: document.getElementById("linkFolder"),
  linkTitleError: document.getElementById("linkTitleError"),
  linkUrlError: document.getElementById("linkUrlError"),
  linkFormError: document.getElementById("linkFormError"),
  folderName: document.getElementById("folderName"),
  folderFormError: document.getElementById("folderFormError"),
  backgroundPreviewImage: document.getElementById("backgroundPreviewImage"),
  backgroundPreviewName: document.getElementById("backgroundPreviewName"),
  backgroundImage: document.getElementById("backgroundImage"),
  backgroundSelectedFile: document.getElementById("backgroundSelectedFile"),
  backgroundImageError: document.getElementById("backgroundImageError"),
  backgroundOverlay: document.getElementById("backgroundOverlay"),
  backgroundOverlayColor: document.getElementById("backgroundOverlayColor"),
  backgroundOverlayValue: document.getElementById("backgroundOverlayValue"),
  singleKeyShortcuts: document.getElementById("singleKeyShortcuts"),
  resetBackgroundButton: document.getElementById("resetBackgroundButton"),
  exportBackupButton: document.getElementById("exportBackupButton"),
  importBackupInput: document.getElementById("importBackupInput"),
  importSelectedFile: document.getElementById("importSelectedFile"),
  importPreview: document.getElementById("importPreview"),
  importPreviewDate: document.getElementById("importPreviewDate"),
  importPreviewSites: document.getElementById("importPreviewSites"),
  importPreviewFolders: document.getElementById("importPreviewFolders"),
  importStatus: document.getElementById("importStatus"),
  importError: document.getElementById("importError"),
  confirmImportButton: document.getElementById("confirmImportButton"),
  cancelImportButton: document.getElementById("cancelImportButton")
};
const storageService = createStorageService({ logger: null });

init();

async function init() {
  const result = await storageService.load(defaultState);
  state = normalizeState(result.state);
  if (!result.ok && result.source === "read-error") {
    showAppStatus(t("storageReadWarning"));
  }

  bindEvents();
  renderSiteEmojiPicker();
  render();
  updateAppReady = true;
}

function bindEvents() {
  elements.addLinkButton.addEventListener("click", () => openLinkDialog());
  elements.addFolderButton.addEventListener("click", () => openFolderDialog());
  elements.settingsButton.addEventListener("click", () => openSettingsDialog());
  document.addEventListener("keydown", handleGlobalShortcut);
  elements.linksGrid.addEventListener("keydown", handleLinkReorderKeydown);
  elements.folderList.addEventListener("keydown", handleFolderReorderKeydown);

  elements.linkTitle.addEventListener("input", () => {
    clearInputError(elements.linkTitle, elements.linkTitleError);
    updateLinkIconLetters();
  });
  elements.linkUrl.addEventListener("input", () => {
    clearInputError(elements.linkUrl, elements.linkUrlError);
    scheduleLinkIconPreview();
  });
  elements.linkIconButton.addEventListener("click", toggleSiteIconPicker);
  elements.linkIconAuto.addEventListener("click", () => selectSiteIconEmoji(""));
  elements.siteEmojiGrid.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-site-emoji]");
    if (choice) selectSiteIconEmoji(choice.dataset.siteEmoji);
  });
  elements.siteEmojiGrid.addEventListener("keydown", handleSiteEmojiGridKeydown);
  document.addEventListener("pointerdown", (event) => {
    if (elements.linkIconPicker.hidden) return;
    if (elements.linkIconPicker.contains(event.target)) return;
    if (elements.linkIconButton.contains(event.target)) return;
    closeSiteIconPicker();
  });
  elements.linkDialog.addEventListener("cancel", (event) => {
    if (elements.linkIconPicker.hidden) return;
    event.preventDefault();
    closeSiteIconPicker({ restoreFocus: true });
  });
  elements.linkDialog.addEventListener("close", () => {
    closeSiteIconPicker();
    clearTimeout(linkIconPreviewTimer);
    linkIconPreviewEpoch += 1;
  });
  elements.folderName.addEventListener("input", () => {
    clearInputError(elements.folderName, elements.folderFormError);
  });

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.close).close();
    });
  });

  elements.confirmDeleteButton.addEventListener("click", () => {
    resolveDeleteConfirmation(true);
  });
  elements.cancelDeleteConfirmButtons.forEach((button) => {
    button.addEventListener("click", () => resolveDeleteConfirmation(false));
  });
  elements.deleteConfirmDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveDeleteConfirmation(false);
  });
  elements.deleteConfirmDialog.addEventListener("close", () => {
    resolveDeleteConfirmation(false);
  });
  elements.deleteConfirmDialog.addEventListener("click", (event) => {
    if (event.target === elements.deleteConfirmDialog) {
      resolveDeleteConfirmation(false);
    }
  });

  elements.linkForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const validation = validateSiteDraft({
      title: elements.linkTitle.value,
      url: elements.linkUrl.value
    });
    if (!validation.ok) {
      if (validation.field === "title") {
        showInputError(elements.linkTitle, elements.linkTitleError, t("siteTitleTooLong"));
      } else {
        showInputError(elements.linkUrl, elements.linkUrlError, t("invalidSiteUrl"));
      }
      return;
    }

    clearInputError(elements.linkTitle, elements.linkTitleError);
    clearInputError(elements.linkUrl, elements.linkUrlError);
    clearFieldError(elements.linkFormError);
    const enteredTitle = elements.linkTitle.value.trim();
    const url = validation.url;
    const folderId = elements.linkFolder.value || ROOT_FOLDER_ID;
    const linkId = editingLinkId || createId();
    const emoji = normalizeSiteEmoji(pendingLinkEmoji);

    const defaultSubmitLabel = editingLinkId ? t("save") : t("add");
    elements.linkSubmitButton.disabled = true;
    elements.linkSubmitButton.setAttribute("aria-busy", "true");
    elements.linkSubmitButton.textContent = defaultSubmitLabel;

    try {
      const title = enteredTitle || deriveTitleFromUrl(url, t("siteFallback"));
      const saved = await commitStateChange(
        (latestState) => {
          const resolvedFolderId = latestState.folders.some((folder) => folder.id === folderId)
            ? folderId
            : ROOT_FOLDER_ID;
          const editingLinkIndex = latestState.links.findIndex((link) => link.id === editingLinkId);

          if (editingLinkId && editingLinkIndex === -1) {
            throw new Error("The site no longer exists");
          }

          if (editingLinkIndex >= 0) {
            const updatedLink = {
              ...latestState.links[editingLinkIndex],
              title,
              url,
              folderId: resolvedFolderId
            };
            if (emoji) updatedLink.emoji = emoji;
            else delete updatedLink.emoji;
            latestState.links[editingLinkIndex] = updatedLink;
          } else {
            latestState.links.unshift({
              id: linkId,
              title,
              url,
              folderId: resolvedFolderId,
              ...(emoji ? { emoji } : {})
            });
          }

          latestState.selectedFolderId =
            resolvedFolderId === ROOT_FOLDER_ID ? "all" : resolvedFolderId;
          return latestState;
        },
        { onError: () => showFieldError(elements.linkFormError, t("storageSaveWarning")) }
      );
      if (!saved) return;

      clearFieldError(elements.linkFormError);
      editingLinkId = null;
      elements.linkForm.reset();
      elements.linkDialog.close();
    } finally {
      elements.linkSubmitButton.disabled = false;
      elements.linkSubmitButton.removeAttribute("aria-busy");
      elements.linkSubmitButton.textContent = editingLinkId ? t("save") : t("add");
    }
  });

  elements.folderForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const validation = validateFolderName(elements.folderName.value);
    if (!validation.ok) {
      const message =
        validation.error === "name-too-long" ? t("folderNameTooLong") : t("folderNameRequired");
      showInputError(elements.folderName, elements.folderFormError, message);
      return;
    }

    clearInputError(elements.folderName, elements.folderFormError);
    const name = validation.name;

    const folder = {
      id: createId(),
      name
    };

    const saved = await commitStateChange(
      (latestState) => {
        latestState.folders.push(folder);
        latestState.selectedFolderId = folder.id;
        return latestState;
      },
      { onError: () => showFieldError(elements.folderFormError, t("storageSaveWarning")) }
    );
    if (!saved) return;

    clearFieldError(elements.folderFormError);
    elements.folderForm.reset();
    elements.folderDialog.close();
  });

  elements.backgroundForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!settingsDraft || savingBackground) return;
    setBackgroundSaving(true);
    try {
      await pendingBackgroundSelection;
      if (backgroundFileError) {
        showBackgroundImageError(backgroundFileError);
        return;
      }
      const file = settingsDraft.imageFile;
      const shortcutsEnabled = elements.singleKeyShortcuts.checked;
      // Preserve customAssetId/availability when the image is unchanged or missing locally.
      let nextBackground = {
        ...settingsDraft.background,
        overlay: Number(elements.backgroundOverlay.value),
        overlayColor: elements.backgroundOverlayColor.value
      };
      if (file) {
        try {
          nextBackground = {
            type: "image",
            value: await readFileAsDataUrl(file),
            overlay: nextBackground.overlay,
            overlayColor: nextBackground.overlayColor
          };
        } catch {
          showBackgroundImageError("decode-failed");
          return;
        }
      }
      const saved = await commitStateChange(
        (latestState) => {
          latestState.background = nextBackground;
          latestState.shortcutsEnabled = shortcutsEnabled;
          return latestState;
        },
        { onError: () => showBackgroundImageError("save-failed") }
      );
      if (!saved) return;
      clearBackgroundImageError();
      elements.settingsDialog.close();
    } finally {
      setBackgroundSaving(false);
    }
  });

  elements.resetBackgroundButton.addEventListener("click", () => {
    if (!settingsDraft || savingBackground) return;
    backgroundFileEpoch += 1;
    pendingBackgroundSelection = null;
    backgroundFileError = null;
    revokeBackgroundPreviewUrl();
    settingsDraft = restoreDefaultBackground(settingsDraft, defaultState.background);
    elements.backgroundImage.value = "";
    clearPendingBackgroundFile();
    clearBackgroundImageError();
    syncSettingsDraftControls();
    previewSettingsDraft();
  });

  elements.backgroundOverlay.addEventListener("input", () => {
    if (!settingsDraft) return;
    const overlay = Number(elements.backgroundOverlay.value);
    settingsDraft.background.overlay = overlay;
    updateOverlayLabel(overlay);
    previewSettingsDraft();
  });

  elements.backgroundOverlayColor.addEventListener("input", () => {
    if (!settingsDraft) return;
    settingsDraft.background.overlayColor = elements.backgroundOverlayColor.value;
    previewSettingsDraft();
  });
  elements.singleKeyShortcuts.addEventListener("change", () => {
    if (settingsDraft) settingsDraft.shortcutsEnabled = elements.singleKeyShortcuts.checked;
  });
  elements.changeBackgroundImageButton.addEventListener("click", () => elements.backgroundImage.click());
  elements.backgroundImage.addEventListener("change", () => {
    pendingBackgroundSelection = updatePendingBackgroundFile();
  });

  elements.settingsTabs.forEach((button) => {
    button.addEventListener("click", () => setSettingsTab(button.dataset.settingsTab));
    button.addEventListener("keydown", handleSettingsTabKeydown);
  });
  elements.exportBackupButton.addEventListener("click", exportBackup);
  elements.importBackupInput.addEventListener("change", loadImportFile);
  elements.confirmImportButton.addEventListener("click", confirmImport);
  elements.cancelImportButton?.addEventListener("click", resetImportState);
  elements.settingsDialog.addEventListener("close", () => {
    resetSettingsDialogState();
    applyBackground();
  });
  elements.settingsDialog.addEventListener("cancel", (event) => {
    if (savingBackground) event.preventDefault();
  });
  elements.settingsDialog.addEventListener("keydown", keepSettingsFocusInside);
  elements.folderDialog.addEventListener("close", () => {
    renamingFolderId = null;
    folderRenameFocusRequest = null;
  });

  elements.folderRow.addEventListener("click", async (event) => {
    const chip = event.target.closest("[data-folder]");
    if (!chip) return;

    const selectedFolderId = chip.dataset.folder;
    folderFocusRequest = selectedFolderId;
    const folderExists = selectedFolderId === "all" ||
      state.folders.some((folder) => folder.id === selectedFolderId);
    selectFolder(folderExists ? selectedFolderId : "all", { saveImmediately: true });
  });
  elements.folderRow.addEventListener("scroll", updateFolderScrollState, { passive: true });
  elements.folderRow.addEventListener("wheel", handleFolderWheel, { passive: false });
  elements.content.addEventListener("wheel", handleContentWheel, { passive: false });
  window.addEventListener("pagehide", () => {
    if (!pendingFolderSelection) return;
    if (folderSelectionSaveTimer !== null) window.clearTimeout(folderSelectionSaveTimer);
    folderSelectionSaveTimer = null;
    void persistFolderSelection();
  });
  document.addEventListener("wheel", (event) => {
    // A gesture started over the header or a dialog must not turn into a swipe
    // when its momentum continues over the sites area.
    if (!elements.content.contains(event.target)) folderGesture.block(event.timeStamp);
  }, { capture: true, passive: true });
  window.addEventListener("resize", scheduleFolderScrollRefresh);

  elements.linksGrid.addEventListener("click", async (event) => {
    const openLink = event.target.closest("[data-open-link]");
    if (openLink && Date.now() < suppressLinkClicksUntil) {
      event.preventDefault();
      return;
    }
    if (
      openLink && pendingFolderSelection && event.button === 0 &&
      !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
    ) {
      event.preventDefault();
      // Finish the pending selection before this new-tab page navigates away.
      // A slow or unavailable sync service must not trap the user on this page.
      await Promise.race([
        persistFolderSelection(),
        new Promise((resolve) => window.setTimeout(resolve, 500))
      ]).catch(() => {});
      window.location.assign(openLink.href);
      return;
    }

    const editButton = event.target.closest("[data-edit-link]");
    if (editButton) {
      event.preventDefault();
      event.stopPropagation();

      const link = state.links.find((item) => item.id === editButton.dataset.editLink);
      if (link) openLinkDialog(link);
    }
  });

  elements.deleteLinkButton.addEventListener("click", async () => {
    const link = state.links.find((item) => item.id === editingLinkId);
    if (!link) return;

    const shouldDelete = await requestDeleteConfirmation(
      t("deleteSiteConfirm", [link.title])
    );
    if (!shouldDelete) return;

    const saved = await commitStateChange((latestState) => {
      latestState.links = latestState.links.filter((item) => item.id !== link.id);
      return latestState;
    });
    if (!saved) return;

    editingLinkId = null;
    elements.linkForm.reset();
    elements.linkDialog.close();
  });

  elements.linksGrid.addEventListener("pointerdown", startLinkDrag);
  document.addEventListener("pointermove", updateLinkDrag);
  document.addEventListener("pointerup", finishLinkDrag);
  document.addEventListener("pointercancel", cancelLinkDrag);

  elements.folderList.addEventListener("pointerdown", startFolderDrag);
  document.addEventListener("pointermove", updateFolderDrag);
  document.addEventListener("pointerup", finishFolderDrag);
  document.addEventListener("pointercancel", cancelFolderDrag);

  elements.folderList.addEventListener("click", async (event) => {
    const renameButton = event.target.closest("[data-rename-folder]");
    if (renameButton) {
      startFolderRename(renameButton.dataset.renameFolder);
      return;
    }

    const saveButton = event.target.closest("[data-save-folder-rename]");
    if (saveButton) {
      const row = saveButton.closest(".folder-list-item");
      const input = row?.querySelector("[data-folder-rename-input]");
      if (input) {
        await saveFolderRename(saveButton.dataset.saveFolderRename, input.value);
      }
      return;
    }

    const cancelButton = event.target.closest("[data-cancel-folder-rename]");
    if (cancelButton) {
      cancelFolderRename(cancelButton.dataset.cancelFolderRename);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-folder]");
    if (!deleteButton) return;

    const folder = state.folders.find((item) => item.id === deleteButton.dataset.deleteFolder);
    if (!folder) return;

    const shouldDelete = await requestDeleteConfirmation(
      t("deleteFolderConfirm", [folder.name])
    );
    if (!shouldDelete) return;

    await commitStateChange((latestState) => removeFolder(latestState, folder.id));
  });

  elements.folderList.addEventListener("keydown", async (event) => {
    const input = event.target.closest("[data-folder-rename-input]");
    if (!input) return;

    if (event.key === "Enter") {
      event.preventDefault();
      await saveFolderRename(input.dataset.folderRenameInput, input.value);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelFolderRename(input.dataset.folderRenameInput);
    }
  });
}

function render() {
  applyBackground(settingsDraft && elements.settingsDialog.open ? getDraftPreviewBackground() : state.background);
  renderShortcutPreference();
  renderFolderOptions();
  renderFolders();
  renderFolderList();
  renderLinks();
}

function renderShortcutPreference() {
  const enabled = state.shortcutsEnabled;
  elements.singleKeyShortcuts.checked = settingsDraft?.shortcutsEnabled ?? enabled;

  for (const { button, key, titleKey, labelKey } of [
    { button: elements.addLinkButton, key: "A", titleKey: "addSiteShortcut", labelKey: "addSite" },
    {
      button: elements.addFolderButton,
      key: "F",
      titleKey: "createFolderShortcut",
      labelKey: "createFolder"
    },
    { button: elements.settingsButton, key: "S", titleKey: "settingsShortcut", labelKey: "settings" }
  ]) {
    button.title = t(enabled ? titleKey : labelKey);
    if (enabled) {
      button.setAttribute("aria-keyshortcuts", key);
    } else {
      button.removeAttribute("aria-keyshortcuts");
    }
  }
}

function renderFolders() {
  const counts = new Map();
  for (const link of state.links) {
    counts.set(link.folderId, (counts.get(link.folderId) || 0) + 1);
  }
  const folders = [
    ["all", t("allFolders"), state.links.length],
    ...getUserFolders().map((folder) => [folder.id, folder.name, counts.get(folder.id) || 0])
  ];
  const structure = JSON.stringify(folders);
  if (structure !== renderedFolderStructure) {
    const chips = folders.map(([id, name, count]) => createFolderChip(id, name, count));
    elements.folderRowTrack.replaceChildren(...chips);
    renderedFolderStructure = structure;
  } else {
    for (const chip of elements.folderRowTrack.children) {
      const button = chip.querySelector("[data-folder]");
      const active = button.dataset.folder === state.selectedFolderId;
      chip.classList.toggle("active", active);
      if (button.getAttribute("aria-pressed") !== String(active)) {
        button.setAttribute("aria-pressed", String(active));
      }
    }
  }

  const selectionChanged =
    renderedFolderSelection !== null && renderedFolderSelection !== state.selectedFolderId;
  const focusFolderId = folderFocusRequest;

  folderFocusRequest = null;
  renderedFolderSelection = state.selectedFolderId;
  scheduleFolderScrollRefresh({ animate: selectionChanged, focusFolderId });
}

function refreshFolderScroll(options = {}) {
  if (options.focusFolderId) {
    const focusTarget = [...elements.folderRowTrack.querySelectorAll("[data-folder]")].find(
      (button) => button.dataset.folder === options.focusFolderId
    );
    focusTarget?.focus({ preventScroll: true });
  }

  const activeChip = elements.folderRowTrack.querySelector(".folder-chip.active");
  if (activeChip) {
    const rowRect = elements.folderRow.getBoundingClientRect();
    const activeRect = activeChip.getBoundingClientRect();
    const targetScrollLeft = getFolderRevealScrollLeft({
      scrollLeft: elements.folderRow.scrollLeft,
      clientWidth: elements.folderRow.clientWidth,
      scrollWidth: elements.folderRow.scrollWidth,
      activeOffsetLeft: activeRect.left - rowRect.left + elements.folderRow.scrollLeft,
      activeOffsetWidth: activeRect.width
    });

    if (targetScrollLeft !== elements.folderRow.scrollLeft) {
      const shouldAnimate =
        options.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches;
      elements.folderRow.scrollTo({
        left: targetScrollLeft,
        behavior: shouldAnimate ? "smooth" : "auto"
      });
    }
  }

  updateFolderScrollState();
}

function scheduleFolderScrollRefresh(options = {}) {
  pendingFolderScrollOptions = {
    animate: Boolean(pendingFolderScrollOptions.animate || options.animate),
    focusFolderId: options.focusFolderId ?? pendingFolderScrollOptions.focusFolderId ?? null
  };

  if (folderScrollFrame !== null) return;

  folderScrollFrame = requestAnimationFrame(() => {
    const nextOptions = pendingFolderScrollOptions;

    folderScrollFrame = null;
    pendingFolderScrollOptions = {};
    refreshFolderScroll(nextOptions);
  });
}

function updateFolderScrollState() {
  const { canScrollLeft, canScrollRight } = getFolderScrollState(elements.folderRow);
  elements.folderRow.classList.toggle("can-scroll-left", canScrollLeft);
  elements.folderRow.classList.toggle("can-scroll-right", canScrollRight);
}

function handleFolderWheel(event) {
  const delta = getWheelScrollDelta(event.deltaX, event.deltaY);
  const nextScrollLeft = getFolderWheelScrollLeft(elements.folderRow, delta);

  if (nextScrollLeft === elements.folderRow.scrollLeft) return;

  event.preventDefault();
  elements.folderRow.scrollLeft = nextScrollLeft;
  updateFolderScrollState();
}

function handleContentWheel(event) {
  const editable = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
  const blocked = Boolean(
    dragState || folderDragState || event.buttons || event.defaultPrevented ||
    document.querySelector("dialog[open]") ||
    event.target.closest?.(editable) || document.activeElement?.closest?.(editable)
  );
  const { consume, direction } = folderGesture.handle(event, { blocked });
  if (consume && event.cancelable) event.preventDefault();
  if (!direction) return;

  const nextFolderId = getAdjacentFolderId(state.folders, state.selectedFolderId, direction);
  if (nextFolderId) selectFolder(nextFolderId);
}

function selectFolder(folderId, { saveImmediately = false } = {}) {
  if (updateInputLocked) return;
  if (folderId === state.selectedFolderId) return;

  const baseId = pendingFolderSelection?.baseId ?? state.selectedFolderId;
  state.selectedFolderId = folderId;
  pendingFolderSelection = { baseId, folderId, revision: ++folderSelectionRevision };
  renderFolders();
  renderLinks();
  elements.content.scrollTop = 0;
  scheduleFolderSelectionSave(saveImmediately ? 0 : FOLDER_SELECTION_SAVE_DELAY_MS);
}

function scheduleFolderSelectionSave(delay = FOLDER_SELECTION_SAVE_DELAY_MS) {
  if (folderSelectionSaveTimer !== null) window.clearTimeout(folderSelectionSaveTimer);
  folderSelectionSaveTimer = window.setTimeout(persistFolderSelection, delay);
}

async function persistFolderSelection() {
  if (folderSelectionSaveTimer !== null) window.clearTimeout(folderSelectionSaveTimer);
  folderSelectionSaveTimer = null;
  if (folderSelectionSaveInFlight) {
    const completedRevision = await folderSelectionSaveInFlight;
    if (pendingFolderSelection && pendingFolderSelection.revision !== completedRevision) {
      return persistFolderSelection();
    }
    return;
  }

  const pending = pendingFolderSelection;
  if (!pending) return;

  const operation = persistFolderSelectionSnapshot(pending);
  const tracked = operation.finally(() => {
    if (folderSelectionSaveInFlight === tracked) folderSelectionSaveInFlight = null;
  });
  folderSelectionSaveInFlight = tracked;
  return tracked;
}

async function persistFolderSelectionSnapshot(pending) {
  const result = await storageService.update(defaultState, (latestState) => {
    // A different tab may have selected a folder since this gesture began.
    if (latestState.selectedFolderId !== pending.baseId) return latestState;
    const folderExists = pending.folderId === "all" ||
      latestState.folders.some((folder) => folder.id === pending.folderId);
    if (folderExists) latestState.selectedFolderId = pending.folderId;
    return latestState;
  });

  if (!result.ok) {
    if (pendingFolderSelection?.revision === pending.revision) {
      showAppStatus(t("storageSaveWarning"));
      scheduleFolderSelectionSave(FOLDER_SELECTION_RETRY_DELAY_MS);
    }
    return pending.revision;
  }

  if (pendingFolderSelection?.revision !== pending.revision) {
    // A newer gesture happened while this write was in progress. It will be
    // saved separately, using the selection that was actually committed.
    if (pendingFolderSelection) pendingFolderSelection.baseId = result.state.selectedFolderId;
    return pending.revision;
  }

  clearPendingFolderSelection();
  state = normalizeState(result.state);
  render();
  clearAppStatus();
  return pending.revision;
}

function clearPendingFolderSelection() {
  if (folderSelectionSaveTimer !== null) window.clearTimeout(folderSelectionSaveTimer);
  folderSelectionSaveTimer = null;
  pendingFolderSelection = null;
}

function createFolderChip(id, name, count) {
  const chip = document.createElement("div");
  chip.className = `folder-chip${state.selectedFolderId === id ? " active" : ""}`;
  chip.title = `${name}: ${count}`;

  const select = document.createElement("button");
  select.className = "folder-select";
  select.type = "button";
  select.dataset.folder = id;
  select.setAttribute("aria-pressed", String(state.selectedFolderId === id));

  const label = document.createElement("span");
  label.className = "folder-name";
  label.textContent = name;
  const counter = document.createElement("span");
  counter.className = "folder-count";
  counter.textContent = String(count);
  counter.hidden = count === 0;
  select.append(label, counter);
  chip.append(select);

  return chip;
}

function renderFolderOptions() {
  const unfiledOption = document.createElement("option");
  unfiledOption.value = ROOT_FOLDER_ID;
  unfiledOption.textContent = t("noFolder");

  const options = getUserFolders().map((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    return option;
  });

  elements.linkFolder.replaceChildren(unfiledOption, ...options);
}

function setFolderRenameControlsDisabled(folderId, disabled) {
  const row = [...elements.folderList.querySelectorAll("[data-folder-id]")].find(
    (item) => item.dataset.folderId === folderId
  );
  if (!row) return;

  const controls = [
    row.querySelector("[data-folder-rename-input]"),
    row.querySelector("[data-save-folder-rename]"),
    row.querySelector("[data-cancel-folder-rename]")
  ].filter(Boolean);

  controls.forEach((control) => {
    control.disabled = disabled;
  });
}

function requestFolderRenameFocus(folderId, target) {
  folderRenameFocusRequest = { folderId, target };
}

function startFolderRename(folderId) {
  if (updateInputLocked) return;
  if (savingFolderRenameId !== null) return;

  const folder = getUserFolders().find((item) => item.id === folderId);
  if (!folder) return;

  renamingFolderId = folder.id;
  requestFolderRenameFocus(folder.id, "input");
  renderFolderList();
}

async function saveFolderRename(folderId, value) {
  if (savingFolderRenameId !== null || folderId !== renamingFolderId) return false;

  const validation = validateFolderName(value);
  const renameInput = [...elements.folderList.querySelectorAll("[data-folder-rename-input]")].find(
    (input) => input.dataset.folderRenameInput === folderId
  );
  if (!validation.ok) {
    const message =
      validation.error === "name-too-long" ? t("folderNameTooLong") : t("folderNameRequired");
    showInputError(renameInput, elements.folderFormError, message);
    return false;
  }

  clearInputError(renameInput, elements.folderFormError);
  const result = renameFolder(state.folders, folderId, value);

  if (!result.renamed) {
    const folderExists = state.folders.some((folder) => folder.id === folderId);
    if (folderExists) {
      renamingFolderId = folderId;
      requestFolderRenameFocus(folderId, "input");
      renderFolderList();
      return false;
    }

    cancelFolderRename(folderId);
    return false;
  }

  savingFolderRenameId = folderId;
  setFolderRenameControlsDisabled(folderId, true);

  try {
    const saved = await commitStateChange(
      (latestState) => {
        const latestResult = renameFolder(latestState.folders, folderId, value);
        if (!latestResult.renamed) throw new Error("The folder no longer exists");
        latestState.folders = latestResult.folders;
        return latestState;
      },
      { onError: () => showFieldError(elements.folderFormError, t("storageSaveWarning")) }
    );
    if (!saved) {
      renamingFolderId = folderId;
      requestFolderRenameFocus(folderId, "input");
      renderFolderList();
      return false;
    }

    clearFieldError(elements.folderFormError);
    renamingFolderId = null;
    folderRenameFocusRequest = null;
    if (elements.folderDialog.open) {
      requestFolderRenameFocus(folderId, "button");
    }
    renderFolderList();
    return true;
  } finally {
    savingFolderRenameId = null;
    setFolderRenameControlsDisabled(folderId, false);
  }
}

function cancelFolderRename(folderId = renamingFolderId) {
  if (savingFolderRenameId !== null && folderId === savingFolderRenameId) return;

  renamingFolderId = null;
  folderRenameFocusRequest = null;
  if (folderId) requestFolderRenameFocus(folderId, "button");
  renderFolderList();
}

function renderFolderList() {
  const folders = getUserFolders();
  elements.folderManager.hidden = folders.length === 0;

  const rows = folders.map((folder) => {
    const isEditing = renamingFolderId === folder.id;
    const row = document.createElement("div");
    row.className = "folder-list-item";
    row.dataset.folderId = folder.id;

    const dragButton = document.createElement("button");
    dragButton.className = "folder-list-drag";
    dragButton.type = "button";
    dragButton.dataset.dragFolder = folder.id;
    dragButton.title = t("drag");
    dragButton.disabled = isEditing;
    dragButton.setAttribute("aria-label", t("reorderFolder", [folder.name]));
    dragButton.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown");
    dragButton.append(
      createIcon(["M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01"])
    );

    const count = document.createElement("span");
    count.className = "folder-list-count";
    const linkCount = state.links.filter((link) => link.folderId === folder.id).length;
    count.textContent = String(linkCount);

    if (isEditing) {
      const input = document.createElement("input");
      input.className = "folder-list-input";
      input.type = "text";
      input.maxLength = 200;
      input.value = folder.name;
      input.dataset.folderRenameInput = folder.id;
      input.setAttribute("aria-label", t("newFolderName", [folder.name]));
      input.setAttribute("aria-describedby", "folderFormError");
      input.addEventListener("input", () => {
        clearInputError(input, elements.folderFormError);
      });

      const saveButton = document.createElement("button");
      saveButton.className = "folder-list-save";
      saveButton.type = "button";
      saveButton.dataset.saveFolderRename = folder.id;
      saveButton.setAttribute("aria-label", t("saveFolderName", [folder.name]));
      saveButton.append(createIcon(["m5 12 4 4L19 6"]));

      const cancelButton = document.createElement("button");
      cancelButton.className = "folder-list-cancel";
      cancelButton.type = "button";
      cancelButton.dataset.cancelFolderRename = folder.id;
      cancelButton.setAttribute("aria-label", t("cancelFolderRename", [folder.name]));
      cancelButton.append(createIcon(["m6 6 12 12M18 6 6 18"]));

      row.append(dragButton, input, count, saveButton, cancelButton);
      return row;
    }

    const name = document.createElement("span");
    name.className = "folder-list-name";
    name.textContent = folder.name;

    const renameButton = document.createElement("button");
    renameButton.className = "folder-list-rename";
    renameButton.type = "button";
    renameButton.dataset.renameFolder = folder.id;
    renameButton.setAttribute("aria-label", t("renameFolder", [folder.name]));
    renameButton.append(
      createIcon(["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"])
    );

    const deleteButton = document.createElement("button");
    deleteButton.className = "folder-list-delete";
    deleteButton.type = "button";
    deleteButton.dataset.deleteFolder = folder.id;
    deleteButton.setAttribute("aria-label", t("deleteFolder", [folder.name]));
    deleteButton.append(
      createIcon([
        "M3 6h18",
        "M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6",
        "M18.5 6 17.7 19A2 2 0 0 1 15.7 21H8.3A2 2 0 0 1 6.3 19L5.5 6",
        "M10 11v5M14 11v5"
      ])
    );

    row.append(dragButton, name, count, renameButton, deleteButton);
    return row;
  });

  elements.folderList.replaceChildren(...rows);

  const focusRequest = folderRenameFocusRequest;
  folderRenameFocusRequest = null;
  if (!focusRequest || !elements.folderDialog.open) return;

  const focusTarget =
    focusRequest.target === "input"
      ? [...elements.folderList.querySelectorAll("[data-folder-rename-input]")].find(
          (input) => input.dataset.folderRenameInput === focusRequest.folderId
        )
      : [...elements.folderList.querySelectorAll("[data-rename-folder]")].find(
          (button) => button.dataset.renameFolder === focusRequest.folderId
        );

  focusTarget?.focus({ preventScroll: true });
  if (focusRequest.target === "input") focusTarget?.select();
}

function renderLinks() {
  const signatures = new Map(state.links.map((link) => [link.id, JSON.stringify([
    link.title, link.url, normalizeSiteEmoji(link.emoji),
    normalizeSiteEmoji(link.emoji) ? [] : buildFaviconSources(link.url)
  ])]));
  for (const [id, entry] of linkCardCache) {
    if (entry.signature !== signatures.get(id)) {
      entry.dispose();
      linkCardCache.delete(id);
    }
  }
  const visibleLinks = getVisibleLinks();
  const cards = visibleLinks.map((link) => {
    if (!linkCardCache.has(link.id)) {
      linkCardCache.set(link.id, { ...createLinkCard(link), signature: signatures.get(link.id) });
    }
    return linkCardCache.get(link.id).card;
  });

  // Move only the nodes whose position/visibility changed. In particular, a
  // background save must not detach and repaint an unchanged grid of cards.
  let next = elements.linksGrid.firstChild;
  for (const card of cards) {
    if (card === next) next = next.nextSibling;
    else elements.linksGrid.insertBefore(card, next);
  }
  while (next) {
    const obsolete = next;
    next = next.nextSibling;
    obsolete.remove();
  }
  if (state.selectedFolderId === "all") {
    elements.emptyState.textContent = t("emptyAll");
  } else {
    const folderName = state.folders.find((folder) => folder.id === state.selectedFolderId)?.name;
    elements.emptyState.textContent = t("emptyFolder", [folderName || t("favoriteFolder")]);
  }
  elements.emptyState.hidden = visibleLinks.length > 0;
}

function createLinkCard(link) {
  const card = document.createElement("article");
  card.className = "link-card";
  card.dataset.linkId = link.id;

  const dragButton = document.createElement("button");
  dragButton.className = "drag-link";
  dragButton.type = "button";
  dragButton.dataset.dragLink = link.id;
  dragButton.title = t("drag");
  dragButton.setAttribute("aria-label", t("reorderSite", [link.title]));
  dragButton.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight");
  dragButton.append(
    createIcon(["M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01"])
  );

  const openLink = document.createElement("a");
  openLink.className = "link-open";
  openLink.href = link.url;
  openLink.rel = "noreferrer";
  openLink.dataset.openLink = link.id;

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const edit = document.createElement("button");
  edit.className = "card-action edit-link";
  edit.type = "button";
  edit.dataset.editLink = link.id;
  edit.title = t("edit");
  edit.setAttribute("aria-label", t("editSite", [link.title]));
  edit.append(
    createIcon(["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"])
  );

  const favicon = document.createElement("span");
  favicon.className = "favicon";
  favicon.classList.add("fallback");

  const faviconImage = document.createElement("img");
  faviconImage.alt = "";
  faviconImage.loading = "eager";

  const faviconLetter = document.createElement("span");
  faviconLetter.className = "favicon-letter";
  const emoji = normalizeSiteEmoji(link.emoji);
  faviconLetter.textContent = emoji || getInitial(link.title);
  favicon.append(faviconImage, faviconLetter);

  const faviconSources = emoji ? [] : buildFaviconSources(link.url);
  let faviconSourceIndex = 0;
  let disposed = false;

  function loadNextFaviconSource() {
    if (disposed) return;
    const source = faviconSources[faviconSourceIndex];

    if (!source) {
      faviconImage.removeAttribute("src");
      favicon.classList.add("fallback");
      return;
    }

    faviconImage.src = source;
  }

  faviconImage.addEventListener("load", () => {
    if (disposed) return;
    if (isUsableFavicon(faviconImage)) {
      favicon.classList.remove("fallback");
      return;
    }

    faviconSourceIndex += 1;
    loadNextFaviconSource();
  });
  faviconImage.addEventListener("error", () => {
    if (disposed) return;
    faviconSourceIndex += 1;
    loadNextFaviconSource();
  });
  if (emoji) favicon.classList.add("emoji");
  else loadNextFaviconSource();

  const text = document.createElement("span");
  text.className = "link-copy";

  const title = document.createElement("span");
  title.className = "link-title";
  title.textContent = link.title;
  title.title = link.title;

  const host = document.createElement("span");
  host.className = "link-host";
  const hostText = getHost(link.url);
  host.textContent = hostText;
  host.title = hostText;
  openLink.title = `${link.title} — ${hostText}`;
  openLink.setAttribute("aria-label", `${link.title} — ${hostText}`);

  text.append(title, host);
  openLink.append(favicon, text);
  actions.append(edit);
  card.append(dragButton, openLink, actions);

  return {
    card,
    dispose() {
      disposed = true;
      faviconImage.removeAttribute("src");
    }
  };
}

async function handleLinkReorderKeydown(event) {
  const handle = event.target.closest("[data-drag-link]");
  const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
  if (!handle || !delta) return;

  const linkId = handle.dataset.dragLink;
  const visibleLinks = getVisibleLinks();
  const preview = moveItemByDelta(
    visibleLinks.map((link) => link.id),
    linkId,
    delta
  );
  if (!preview.moved) return;

  event.preventDefault();
  const selectedFolderId = state.selectedFolderId;
  const linkTitle = visibleLinks.find((link) => link.id === linkId)?.title || t("siteFallback");
  const saved = await commitStateChange((latestState) => {
    const latestMove = moveItemByDelta(
      getVisibleLinks(latestState, selectedFolderId).map((link) => link.id),
      linkId,
      delta
    );
    return latestMove.moved
      ? reorderVisibleLinksByIds(latestState, latestMove.ids)
      : latestState;
  });
  if (!saved) return;

  focusReorderHandle(elements.linksGrid, "dragLink", linkId);
  const committedLinks = getVisibleLinks();
  const position = committedLinks.findIndex((link) => link.id === linkId) + 1;
  announceReorder(t("itemMoved", [linkTitle, position, committedLinks.length]));
}

function startLinkDrag(event) {
  if (updateInputLocked) return;
  const handle = event.target.closest("[data-drag-link]");
  if (!handle || event.button !== 0 || event.isPrimary === false) return;

  const card = handle.closest("[data-link-id]");
  if (!card) return;

  event.preventDefault();
  event.stopPropagation();

  dragState = {
    pointerId: event.pointerId,
    sourceId: card.dataset.linkId,
    startX: event.clientX,
    startY: event.clientY,
    targetId: null,
    after: false,
    moved: false,
    card,
    handle
  };

  handle.setPointerCapture?.(event.pointerId);
}

function updateLinkDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
  if (!dragState.moved && distance < 5) return;

  event.preventDefault();
  dragState.moved = true;
  dragState.card.classList.add("is-dragging");
  document.body.classList.add("is-sorting");

  const candidates = [...elements.linksGrid.querySelectorAll("[data-link-id]")].filter(
    (card) => card.dataset.linkId !== dragState.sourceId
  );
  const target = candidates.find((card) => {
    const rect = card.getBoundingClientRect();
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  });

  clearDropIndicators();

  if (!target) {
    dragState.targetId = null;
    return;
  }

  const rect = target.getBoundingClientRect();
  const isSameRow = Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height * 0.28;
  dragState.after = isSameRow
    ? event.clientX > rect.left + rect.width / 2
    : event.clientY > rect.top + rect.height / 2;
  dragState.targetId = target.dataset.linkId;
  target.classList.add(dragState.after ? "drop-after" : "drop-before");
}

async function finishLinkDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  const currentDrag = dragState;
  const shouldReorder =
    currentDrag.moved && currentDrag.targetId && currentDrag.targetId !== currentDrag.sourceId;

  cleanupLinkDrag(currentDrag);

  if (!shouldReorder) return;

  suppressLinkClicksUntil = Date.now() + 400;
  const selectedFolderId = state.selectedFolderId;
  await commitStateChange((latestState) =>
    reorderVisibleLinks(
      latestState,
      currentDrag.sourceId,
      currentDrag.targetId,
      currentDrag.after,
      selectedFolderId
    )
  );
}

function cancelLinkDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  cleanupLinkDrag(dragState);
}

function cleanupLinkDrag(currentDrag) {
  try {
    currentDrag.handle.releasePointerCapture?.(currentDrag.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }

  currentDrag.card.classList.remove("is-dragging");
  document.body.classList.remove("is-sorting");
  clearDropIndicators();
  dragState = null;
}

function clearDropIndicators() {
  elements.linksGrid.querySelectorAll(".drop-before, .drop-after").forEach((card) => {
    card.classList.remove("drop-before", "drop-after");
  });
}

function reorderVisibleLinks(targetState, sourceId, targetId, after, selectedFolderId) {
  const visibleLinks = getVisibleLinks(targetState, selectedFolderId);
  const orderedIds = visibleLinks.map((link) => link.id);
  const sourceIndex = orderedIds.indexOf(sourceId);

  if (sourceIndex === -1 || !orderedIds.includes(targetId)) return targetState;

  orderedIds.splice(sourceIndex, 1);
  const targetIndex = orderedIds.indexOf(targetId);
  orderedIds.splice(targetIndex + (after ? 1 : 0), 0, sourceId);

  const linksById = new Map(visibleLinks.map((link) => [link.id, link]));
  const visibleIds = new Set(orderedIds);
  let cursor = 0;

  targetState.links = targetState.links.map((link) => {
    if (!visibleIds.has(link.id)) return link;
    const nextLink = linksById.get(orderedIds[cursor]);
    cursor += 1;
    return nextLink;
  });
  return targetState;
}

function reorderVisibleLinksByIds(targetState, orderedIds) {
  const linksById = new Map(targetState.links.map((link) => [link.id, link]));
  const visibleIds = new Set(orderedIds);
  let cursor = 0;

  targetState.links = targetState.links.map((link) => {
    if (!visibleIds.has(link.id)) return link;
    const nextLink = linksById.get(orderedIds[cursor]);
    cursor += 1;
    return nextLink;
  });
  return targetState;
}

async function handleFolderReorderKeydown(event) {
  const handle = event.target.closest("[data-drag-folder]");
  const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
  if (!handle || handle.disabled || !delta) return;

  const folderId = handle.dataset.dragFolder;
  const userFolders = getUserFolders();
  const preview = moveItemByDelta(
    userFolders.map((folder) => folder.id),
    folderId,
    delta
  );
  if (!preview.moved) return;

  event.preventDefault();
  const folderName = userFolders.find((folder) => folder.id === folderId)?.name || "";
  const saved = await commitStateChange((latestState) => {
    const latestFolders = getUserFolders(latestState);
    const latestMove = moveItemByDelta(
      latestFolders.map((folder) => folder.id),
      folderId,
      delta
    );
    if (!latestMove.moved) return latestState;

    const foldersById = new Map(latestFolders.map((folder) => [folder.id, folder]));
    const rootFolder = latestState.folders.find((folder) => folder.id === ROOT_FOLDER_ID);
    latestState.folders = [
      rootFolder,
      ...latestMove.ids.map((id) => foldersById.get(id))
    ].filter(Boolean);
    return latestState;
  });
  if (!saved) return;

  focusReorderHandle(elements.folderList, "dragFolder", folderId);
  const committedFolders = getUserFolders();
  const position = committedFolders.findIndex((folder) => folder.id === folderId) + 1;
  announceReorder(t("itemMoved", [folderName, position, committedFolders.length]));
}

function focusReorderHandle(container, dataKey, id) {
  const attribute = `data-${dataKey.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  const target = [...container.querySelectorAll(`[${attribute}]`)].find(
    (element) => element.dataset[dataKey] === id
  );
  target?.focus({ preventScroll: true });
}

function announceReorder(message) {
  elements.reorderStatus.textContent = message;
}

function startFolderDrag(event) {
  if (updateInputLocked) return;
  const handle = event.target.closest("[data-drag-folder]");
  if (!handle || handle.disabled || event.button !== 0 || event.isPrimary === false) return;

  const row = handle.closest("[data-folder-id]");
  if (!row) return;

  event.preventDefault();
  event.stopPropagation();

  folderDragState = {
    pointerId: event.pointerId,
    sourceId: row.dataset.folderId,
    startY: event.clientY,
    targetId: null,
    after: false,
    moved: false,
    row,
    handle
  };

  handle.setPointerCapture?.(event.pointerId);
}

function updateFolderDrag(event) {
  if (!folderDragState || event.pointerId !== folderDragState.pointerId) return;

  if (!folderDragState.moved && Math.abs(event.clientY - folderDragState.startY) < 4) return;

  event.preventDefault();
  folderDragState.moved = true;
  folderDragState.row.classList.add("is-dragging");
  document.body.classList.add("is-sorting");

  const candidates = [...elements.folderList.querySelectorAll("[data-folder-id]")].filter(
    (row) => row.dataset.folderId !== folderDragState.sourceId
  );
  const target = candidates.find((row) => {
    const rect = row.getBoundingClientRect();
    return event.clientY >= rect.top && event.clientY <= rect.bottom;
  });

  clearFolderDropIndicators();

  if (!target) {
    folderDragState.targetId = null;
    return;
  }

  const rect = target.getBoundingClientRect();
  folderDragState.after = event.clientY > rect.top + rect.height / 2;
  folderDragState.targetId = target.dataset.folderId;
  target.classList.add(folderDragState.after ? "folder-drop-after" : "folder-drop-before");
}

async function finishFolderDrag(event) {
  if (!folderDragState || event.pointerId !== folderDragState.pointerId) return;

  const currentDrag = folderDragState;
  const shouldReorder =
    currentDrag.moved && currentDrag.targetId && currentDrag.targetId !== currentDrag.sourceId;

  cleanupFolderDrag(currentDrag);
  if (!shouldReorder) return;

  await commitStateChange((latestState) =>
    reorderFolders(latestState, currentDrag.sourceId, currentDrag.targetId, currentDrag.after)
  );
}

function cancelFolderDrag(event) {
  if (!folderDragState || event.pointerId !== folderDragState.pointerId) return;
  cleanupFolderDrag(folderDragState);
}

function cleanupFolderDrag(currentDrag) {
  try {
    currentDrag.handle.releasePointerCapture?.(currentDrag.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }

  currentDrag.row.classList.remove("is-dragging");
  document.body.classList.remove("is-sorting");
  clearFolderDropIndicators();
  folderDragState = null;
}

function clearFolderDropIndicators() {
  elements.folderList
    .querySelectorAll(".folder-drop-before, .folder-drop-after")
    .forEach((row) => row.classList.remove("folder-drop-before", "folder-drop-after"));
}

function reorderFolders(targetState, sourceId, targetId, after) {
  const userFolders = getUserFolders(targetState);
  const orderedIds = userFolders.map((folder) => folder.id);
  const sourceIndex = orderedIds.indexOf(sourceId);

  if (sourceIndex === -1 || !orderedIds.includes(targetId)) return targetState;

  orderedIds.splice(sourceIndex, 1);
  const targetIndex = orderedIds.indexOf(targetId);
  orderedIds.splice(targetIndex + (after ? 1 : 0), 0, sourceId);

  const foldersById = new Map(userFolders.map((folder) => [folder.id, folder]));
  const rootFolder = targetState.folders.find((folder) => folder.id === ROOT_FOLDER_ID);
  targetState.folders = [rootFolder, ...orderedIds.map((id) => foldersById.get(id))].filter(Boolean);
  return targetState;
}

function applyBackground(background = state.background) {
  const defaultBackgroundColor =
    defaultState.background.type === "color"
      ? defaultState.background.value
      : defaultState.background.overlayColor;
  const backgroundColor =
    background.type === "color" && /^#[0-9a-f]{6}$/i.test(background.value)
      ? background.value
      : defaultBackgroundColor;
  const hasImageBackground = background.type === "image" && Boolean(background.value);

  document.body.classList.toggle("has-image", hasImageBackground);
  document.body.classList.toggle("has-color", !hasImageBackground);
  document.documentElement.style.setProperty("--bg", backgroundColor);
  document.documentElement.style.setProperty(
    "--bg-overlay-color",
    background.overlayColor || defaultState.background.overlayColor
  );
  document.documentElement.style.setProperty(
    "--bg-overlay-opacity",
    String(background.overlay / 100)
  );
  if (hasImageBackground) {
    document.documentElement.style.setProperty("--bg-image", `url("${background.value}")`);
  } else {
    document.documentElement.style.removeProperty("--bg-image");
  }
}

function renderSiteEmojiPicker() {
  const choices = SITE_EMOJI_OPTIONS.map(({ emoji, labelKey }) => {
    const button = document.createElement("button");
    button.className = "site-emoji-choice";
    button.type = "button";
    button.dataset.siteEmoji = emoji;
    button.textContent = emoji;
    button.setAttribute("aria-label", t(labelKey));
    button.setAttribute("aria-pressed", "false");
    return button;
  });
  elements.siteEmojiGrid.replaceChildren(...choices);
}

function updateSiteEmojiSelection() {
  elements.linkIconAuto.setAttribute("aria-pressed", String(!pendingLinkEmoji));
  elements.siteEmojiGrid.querySelectorAll("[data-site-emoji]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.siteEmoji === pendingLinkEmoji));
  });
}

function toggleSiteIconPicker() {
  if (!elements.linkIconPicker.hidden) {
    closeSiteIconPicker({ restoreFocus: true });
    return;
  }

  clearTimeout(linkIconPreviewTimer);
  updateLinkIconPreview();
  updateSiteEmojiSelection();
  elements.linkIconPicker.hidden = false;
  elements.linkIconButton.setAttribute("aria-expanded", "true");
  const selected = pendingLinkEmoji
    ? [...elements.siteEmojiGrid.querySelectorAll("[data-site-emoji]")].find(
        (button) => button.dataset.siteEmoji === pendingLinkEmoji
      )
    : elements.linkIconAuto;
  (selected || elements.linkIconAuto).focus();
}

function closeSiteIconPicker({ restoreFocus = false } = {}) {
  if (elements.linkIconPicker.hidden) return;
  elements.linkIconPicker.hidden = true;
  elements.linkIconButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.linkIconButton.focus({ preventScroll: true });
}

function selectSiteIconEmoji(value) {
  pendingLinkEmoji = normalizeSiteEmoji(value);
  clearTimeout(linkIconPreviewTimer);
  updateLinkIconPreview();
  updateSiteEmojiSelection();
  closeSiteIconPicker({ restoreFocus: true });
}

function handleSiteEmojiGridKeydown(event) {
  const button = event.target.closest("[data-site-emoji]");
  if (!button) return;
  const columns = 5;
  const delta = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -columns,
    ArrowDown: columns
  }[event.key];
  if (!delta) return;

  event.preventDefault();
  const choices = [...elements.siteEmojiGrid.querySelectorAll("[data-site-emoji]")];
  const nextIndex = Math.min(choices.length - 1, Math.max(0, choices.indexOf(button) + delta));
  choices[nextIndex]?.focus();
}

function updateLinkIconLetters() {
  const url = normalizeWebUrl(elements.linkUrl.value);
  const title = elements.linkTitle.value.trim() ||
    (url ? deriveTitleFromUrl(url, t("siteFallback")) : t("siteFallback"));
  const letter = getInitial(title);
  elements.linkIconPreviewLetter.textContent = letter;
  elements.linkIconAutoLetter.textContent = letter;
}

function resetLinkIconImages() {
  for (const [preview, image] of [
    [elements.linkIconPreview, elements.linkIconPreviewImage],
    [elements.linkIconAutoPreview, elements.linkIconAutoImage]
  ]) {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
    preview.classList.add("fallback");
  }
}

function scheduleLinkIconPreview() {
  clearTimeout(linkIconPreviewTimer);
  linkIconPreviewEpoch += 1;
  updateLinkIconLetters();
  if (pendingLinkEmoji) return;
  resetLinkIconImages();
  linkIconPreviewTimer = setTimeout(updateLinkIconPreview, 350);
}

function updateLinkIconPreview() {
  clearTimeout(linkIconPreviewTimer);
  const epoch = ++linkIconPreviewEpoch;
  updateLinkIconLetters();
  resetLinkIconImages();
  const emoji = normalizeSiteEmoji(pendingLinkEmoji);
  elements.linkIconPreview.classList.toggle("is-emoji", Boolean(emoji));
  elements.linkIconPreviewEmoji.textContent = emoji;
  if (emoji) return;

  const url = normalizeWebUrl(elements.linkUrl.value);
  if (!url) return;
  const sources = buildFaviconSources(url);
  for (const [preview, image] of [
    [elements.linkIconPreview, elements.linkIconPreviewImage],
    [elements.linkIconAutoPreview, elements.linkIconAutoImage]
  ]) {
    let sourceIndex = 0;
    const loadNext = () => {
      if (epoch !== linkIconPreviewEpoch) return;
      const source = sources[sourceIndex];
      if (!source) {
        image.removeAttribute("src");
        preview.classList.add("fallback");
        return;
      }
      image.src = source;
    };
    image.onload = () => {
      if (epoch !== linkIconPreviewEpoch) return;
      if (isUsableFavicon(image)) {
        preview.classList.remove("fallback");
        return;
      }
      sourceIndex += 1;
      loadNext();
    };
    image.onerror = () => {
      if (epoch !== linkIconPreviewEpoch) return;
      sourceIndex += 1;
      loadNext();
    };
    loadNext();
  }
}

function openLinkDialog(link = null) {
  renderFolderOptions();

  clearInputError(elements.linkTitle, elements.linkTitleError);
  clearInputError(elements.linkUrl, elements.linkUrlError);
  clearFieldError(elements.linkFormError);
  editingLinkId = link?.id || null;
  elements.linkDialogTitle.textContent = link ? t("editSiteDialog") : t("addSiteDialog");
  elements.linkSubmitButton.textContent = link ? t("save") : t("add");
  elements.deleteLinkButton.hidden = !link;
  elements.linkTitle.value = link?.title || "";
  elements.linkUrl.value = link?.url || "";
  pendingLinkEmoji = normalizeSiteEmoji(link?.emoji);
  closeSiteIconPicker();
  updateLinkIconPreview();
  updateSiteEmojiSelection();
  elements.linkFolder.value = link
    ? link.folderId
    : state.selectedFolderId === "all"
      ? ROOT_FOLDER_ID
      : state.selectedFolderId;
  openDialog(elements.linkDialog, link ? elements.linkTitle : elements.linkUrl);
}

function openFolderDialog() {
  clearInputError(elements.folderName, elements.folderFormError);
  renderFolderList();
  openDialog(elements.folderDialog, elements.folderName);
}

function openSettingsDialog() {
  resetSettingsDialogState();
  settingsDraft = createSettingsDraft(state, defaultState.background);
  syncSettingsDraftControls();
  updateBackgroundPreview(settingsDraft.background);
  openDialog(elements.settingsDialog, elements.settingsTabs[0]);
}

function syncSettingsDraftControls() {
  const background = settingsDraft.background;
  const customBackgroundMissing =
    background.customAssetId && background.customAssetAvailable === false;
  const hasCustomBackground =
    settingsDraft.imageFile || background.customAssetId || background.value.startsWith("data:image/");
  elements.backgroundPreviewName.textContent = customBackgroundMissing
    ? t("missingLocalBackground")
    : hasCustomBackground
      ? t("customImage")
      : t("standardImage");
  elements.backgroundOverlay.value = background.overlay;
  elements.backgroundOverlayColor.value =
    background.overlayColor || defaultState.background.overlayColor;
  elements.singleKeyShortcuts.checked = settingsDraft.shortcutsEnabled;
  updateOverlayLabel(background.overlay);
}

function getDraftPreviewBackground() {
  return backgroundPreviewUrl
    ? { ...settingsDraft.background, type: "image", value: backgroundPreviewUrl }
    : settingsDraft.background;
}

function previewSettingsDraft() {
  const background = getDraftPreviewBackground();
  updateBackgroundPreview(background);
  applyBackground(background);
}

function setBackgroundSaving(saving) {
  savingBackground = saving;
  elements.backgroundFields.disabled = saving;
  elements.saveBackgroundButton.disabled = saving;
  elements.settingsDialog.setAttribute("aria-busy", String(saving));
  elements.settingsDialog.querySelectorAll('[data-close="settingsDialog"]').forEach((button) => {
    button.disabled = saving;
  });
}

function handleGlobalShortcut(event) {
  if (updateInputLocked) return;
  if (event.defaultPrevented) return;
  if (!state.shortcutsEnabled) return;

  const action = getGlobalShortcutAction({
    code: event.code,
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat,
    isEditable: isEditableTarget(event.target),
    isDialogOpen: Boolean(document.querySelector("dialog[open]"))
  });
  const button = {
    "add-site": elements.addLinkButton,
    "add-folder": elements.addFolderButton,
    settings: elements.settingsButton
  }[action];

  if (!button) return;
  event.preventDefault();
  button.click();
}

function isEditableTarget(target) {
  const editable = target?.closest?.("input, textarea, select, [contenteditable]");
  if (!editable || editable.getAttribute("contenteditable") === "false") return false;

  const ownerDialog = editable.closest("dialog");
  return !ownerDialog || ownerDialog.open;
}

function updateBackgroundPreview(background) {
  const hasImage = background.type === "image" && Boolean(background.value);
  elements.backgroundPreviewImage.style.backgroundColor = hasImage
    ? ""
    : background.value;
  elements.backgroundPreviewImage.style.backgroundImage = hasImage
    ? `url("${background.value}")`
    : "none";
  elements.backgroundPreviewImage.style.setProperty("--preview-overlay-color", background.overlayColor);
  elements.backgroundPreviewImage.style.setProperty("--preview-overlay-opacity", String(background.overlay / 100));
}

function setSettingsTab(tabName, { focus = false } = {}) {
  activeSettingsTab = tabName === "backup" ? "backup" : "background";
  elements.settingsTabs.forEach((button) => {
    const isActive = button.dataset.settingsTab === activeSettingsTab;
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
    if (isActive && focus) button.focus();
  });

  elements.backgroundSettingsPanel.hidden = activeSettingsTab !== "background";
  elements.backupSettingsPanel.hidden = activeSettingsTab !== "backup";
  elements.settingsGeneralActions.hidden = activeSettingsTab !== "background";
  elements.settingsBackupActions.hidden = activeSettingsTab !== "backup";
  elements.settingsDialog.querySelector(".settings-body").scrollTop = 0;
}

function handleSettingsTabKeydown(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();

  const tabs = [...elements.settingsTabs];
  const currentIndex = tabs.indexOf(event.currentTarget);
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  setSettingsTab(tabs[nextIndex].dataset.settingsTab, { focus: true });
}

function keepSettingsFocusInside(event) {
  if (event.key !== "Tab") return;
  const controls = [...elements.settingsDialog.querySelectorAll('button, input, select, a[href], [tabindex]')]
    .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  const target = event.shiftKey && document.activeElement === first
    ? last
    : !event.shiftKey && document.activeElement === last ? first : null;
  if (!target) return;
  event.preventDefault();
  target.focus({ preventScroll: true });
}

function exportBackup() {
  try {
    const contents = serializeBackup(state);
    const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = getBackupFilename();
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    showSettingsStatus(t("exportSuccess"));
  } catch {
    showImportError(t("exportError"));
  }
}

async function loadImportFile(event) {
  return trackUpdateOperation(async () => {
    const file = event.target.files?.[0];
    clearImportPreviewState();
    if (!file) return;

    if (file.size > MAX_BACKUP_BYTES) {
      elements.importBackupInput.value = "";
      showImportError(t("backupTooLargeDetailed"));
      return;
    }

    let contents;
    try {
      contents = await file.text();
    } catch {
      resetImportState();
      showImportError(t("fileReadError"));
      return;
    }

    resetImportState();
    const result = parseBackupText(contents);
    if (!result.ok) {
      showImportError(getImportErrorMessage(result.error));
      return;
    }

    pendingImport = { ...result, fileName: file.name };
    elements.importSelectedFile.textContent = t("importSelectedFile", [pendingImport.fileName]);
    elements.importSelectedFile.hidden = false;
    elements.importPreviewDate.textContent = new Intl.DateTimeFormat(uiLocale, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(result.preview.createdAt));
    elements.importPreviewSites.textContent = String(result.preview.siteCount);
    elements.importPreviewFolders.textContent = String(result.preview.folderCount);
    elements.importPreview.hidden = false;
    elements.confirmImportButton.hidden = false;
    elements.cancelImportButton.hidden = false;
  });
}

async function confirmImport() {
  if (!pendingImport) return;

  const importedData = pendingImport.data;
  elements.confirmImportButton.disabled = true;
  const saved = await commitStateChange(
    (latestState) =>
      normalizeState({
        ...buildImportedState(latestState, importedData),
        shortcutsEnabled: latestState.shortcutsEnabled
      }),
    { onError: () => showImportError(t("importSaveError")) }
  );
  elements.confirmImportButton.disabled = false;

  if (!saved) return;

  resetImportState();
  showSettingsStatus(t("importSuccess"));
}

function resetImportState() {
  elements.importBackupInput.value = "";
  clearImportPreviewState();
}

function clearImportPreviewState() {
  pendingImport = null;
  elements.importSelectedFile.textContent = "";
  elements.importSelectedFile.hidden = true;
  elements.importPreview.hidden = true;
  elements.confirmImportButton.hidden = true;
  elements.confirmImportButton.disabled = false;
  elements.cancelImportButton.hidden = true;
  elements.importStatus.hidden = true;
  elements.importError.hidden = true;
}

function resetSettingsDialogState() {
  backgroundFileEpoch += 1;
  pendingBackgroundSelection = null;
  backgroundFileError = null;
  revokeBackgroundPreviewUrl();
  settingsDraft = null;
  elements.backgroundForm.reset();
  clearPendingBackgroundFile();
  clearBackgroundImageError();
  resetImportState();
  setSettingsTab("background");
}

function showSettingsStatus(message) {
  elements.importError.hidden = true;
  elements.importStatus.textContent = message;
  elements.importStatus.hidden = false;
}

function showImportError(message) {
  elements.importStatus.hidden = true;
  elements.importError.textContent = message;
  elements.importError.hidden = false;
}

function showBackgroundImageError(error) {
  const messageKeys = {
    "invalid-type": "backgroundInvalidType",
    "file-too-large": "backgroundTooLarge",
    "dimensions-too-large": "backgroundDimensionsTooLarge",
    "decode-failed": "backgroundDecodeFailed",
    "save-failed": "backgroundSaveFailed"
  };
  elements.backgroundImageError.textContent = t(
    messageKeys[error] || "backgroundDecodeFailed"
  );
  elements.backgroundImageError.hidden = false;
  elements.backgroundImage.setAttribute("aria-invalid", "true");
}

function clearBackgroundImageError() {
  elements.backgroundImageError.textContent = "";
  elements.backgroundImageError.hidden = true;
  elements.backgroundImage.removeAttribute("aria-invalid");
}

async function updatePendingBackgroundFile() {
  return trackUpdateOperation(async () => {
    if (!settingsDraft) return;
    const draft = settingsDraft;
    const epoch = ++backgroundFileEpoch;
    const file = elements.backgroundImage.files?.[0];
    draft.imageFile = file || null;
    backgroundFileError = null;
    clearBackgroundImageError();

    if (!file) {
      clearPendingBackgroundFile();
      revokeBackgroundPreviewUrl();
      previewSettingsDraft();
      return;
    }

    elements.backgroundSelectedFile.textContent = t("backgroundSelectedFile", [file.name]);
    elements.backgroundSelectedFile.hidden = false;

    const validation = validateBackgroundImage({ type: file.type, size: file.size });
    if (!validation.ok) {
      backgroundFileError = validation.error;
      showBackgroundImageError(validation.error);
      return;
    }
    try {
      const { width, height } = await readImageDimensions(file);
      if (epoch !== backgroundFileEpoch || draft !== settingsDraft) return;
      const imageValidation = validateBackgroundImage({ type: file.type, size: file.size, width, height });
      if (!imageValidation.ok) {
        backgroundFileError = imageValidation.error;
        showBackgroundImageError(imageValidation.error);
        return;
      }
      revokeBackgroundPreviewUrl();
      backgroundPreviewUrl = URL.createObjectURL(file);
      syncSettingsDraftControls();
      previewSettingsDraft();
    } catch {
      if (epoch !== backgroundFileEpoch || draft !== settingsDraft) return;
      backgroundFileError = "decode-failed";
      showBackgroundImageError("decode-failed");
    }
  });
}

function revokeBackgroundPreviewUrl() {
  if (backgroundPreviewUrl) URL.revokeObjectURL(backgroundPreviewUrl);
  backgroundPreviewUrl = null;
}

function clearPendingBackgroundFile() {
  elements.backgroundSelectedFile.textContent = "";
  elements.backgroundSelectedFile.hidden = true;
}

function getImportErrorMessage(error) {
  if (error === "file-too-large") return t("importFileTooLarge");
  if (error === "unsupported-backup") return t("unsupportedBackup");
  if (error === "invalid-backup-data") return t("invalidBackupData");
  return t("invalidBackupJson");
}

function openDialog(dialog, focusTarget) {
  if (updateInputLocked) return;
  if (!dialog.open) {
    dialog.showModal();
  }

  focusTarget?.focus({ preventScroll: true });
}

function requestDeleteConfirmation(message) {
  if (pendingDeleteConfirmation) return Promise.resolve(false);
  deleteConfirmationReturnFocus = document.activeElement;
  elements.deleteConfirmMessage.textContent = message;

  return new Promise((resolve) => {
    pendingDeleteConfirmation = resolve;
    elements.deleteConfirmDialog.showModal();
    elements.cancelDeleteButton.focus({ preventScroll: true });
  });
}

function resolveDeleteConfirmation(confirmed) {
  const resolve = pendingDeleteConfirmation;
  if (!resolve) return;

  const returnFocus = deleteConfirmationReturnFocus;
  pendingDeleteConfirmation = null;
  deleteConfirmationReturnFocus = null;
  if (elements.deleteConfirmDialog.open) elements.deleteConfirmDialog.close();
  returnFocus?.focus({ preventScroll: true });
  resolve(Boolean(confirmed));
}

async function commitStateChange(transform, options = {}) {
  return trackUpdateOperation(async () => {
    let observedSelectionRevision = null;
    const result = await storageService.update(defaultState, async (latestState) => {
      const pending = pendingFolderSelection;
      observedSelectionRevision = pending?.revision ?? null;
      if (pending && latestState.selectedFolderId === pending.baseId) {
        latestState.selectedFolderId = pending.folderId;
      }
      const transformed = await transform(latestState);
      return transformed === undefined ? latestState : transformed;
    });
    if (!result.ok) {
      if (typeof options.onError === "function") {
        options.onError(result);
      } else {
        showAppStatus(t("storageSaveWarning"));
      }
      return false;
    }

    if (pendingFolderSelection?.revision === observedSelectionRevision) {
      clearPendingFolderSelection();
    } else if (pendingFolderSelection) {
      pendingFolderSelection.baseId = result.state.selectedFolderId;
    }
    state = normalizeState({
      ...result.state,
      ...(pendingFolderSelection ? { selectedFolderId: pendingFolderSelection.folderId } : {})
    });
    render();
    clearAppStatus();
    return true;
  });
}

function showAppStatus(message) {
  if (!elements.appStatus) return;
  if (appStatusTimer !== null) window.clearTimeout(appStatusTimer);
  elements.appStatus.textContent = message;
  elements.appStatus.hidden = false;
  appStatusTimer = window.setTimeout(clearAppStatus, 6000);
}

function clearAppStatus() {
  if (appStatusTimer !== null) window.clearTimeout(appStatusTimer);
  appStatusTimer = null;
  if (!elements.appStatus) return;
  elements.appStatus.textContent = "";
  elements.appStatus.hidden = true;
}

function showFieldError(element, message) {
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
}

function clearFieldError(element) {
  if (!element) return;
  element.textContent = "";
  element.hidden = true;
}

function showInputError(input, errorElement, message) {
  showFieldError(errorElement, message);
  if (!input) return;
  input.setAttribute("aria-invalid", "true");
  input.focus({ preventScroll: true });
}

function clearInputError(input, errorElement) {
  clearFieldError(errorElement);
  if (!input) return;
  input.removeAttribute("aria-invalid");
}

function normalizeState(savedState) {
  const nextState = {
    ...structuredClone(defaultState),
    ...(savedState || {})
  };

  if (!Array.isArray(nextState.folders)) {
    nextState.folders = structuredClone(defaultState.folders);
  }

  if (!nextState.folders.some((folder) => folder.id === ROOT_FOLDER_ID)) {
    nextState.folders.unshift(structuredClone(defaultState.folders[0]));
  }

  if (!Array.isArray(nextState.links)) {
    nextState.links = [];
  }

  if (!nextState.background?.type || !nextState.background?.value) {
    nextState.background = structuredClone(defaultState.background);
  }

  nextState.background = normalizeLegacyColorBackground(
    nextState.background,
    defaultState.background
  );

  nextState.background.overlay = clampOverlay(nextState.background.overlay);
  if (!/^#[0-9a-f]{6}$/i.test(nextState.background.overlayColor || "")) {
    nextState.background.overlayColor = defaultState.background.overlayColor;
  }

  const folderIds = new Set(nextState.folders.map((folder) => folder.id));
  nextState.links = nextState.links.map((link) => ({
    ...link,
    folderId: folderIds.has(link.folderId) ? link.folderId : ROOT_FOLDER_ID
  }));

  if (
    nextState.selectedFolderId === ROOT_FOLDER_ID ||
    (nextState.selectedFolderId !== "all" && !folderIds.has(nextState.selectedFolderId))
  ) {
    nextState.selectedFolderId = "all";
  }

  nextState.shortcutsEnabled = nextState.shortcutsEnabled !== false;

  return nextState;
}

function removeFolder(targetState, folderId) {
  if (folderId === ROOT_FOLDER_ID) return targetState;

  targetState.folders = targetState.folders.filter((folder) => folder.id !== folderId);
  targetState.links = targetState.links.map((link) => ({
    ...link,
    folderId: link.folderId === folderId ? ROOT_FOLDER_ID : link.folderId
  }));

  if (targetState.selectedFolderId === folderId) {
    targetState.selectedFolderId = "all";
  }
  return targetState;
}

function getUserFolders(targetState = state) {
  return targetState.folders.filter((folder) => folder.id !== ROOT_FOLDER_ID);
}

function getVisibleLinks(targetState = state, selectedFolderId = targetState.selectedFolderId) {
  return selectedFolderId === "all"
    ? targetState.links
    : targetState.links.filter((link) => link.folderId === selectedFolderId);
}

function getHost(value) {
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function getInitial(title) {
  return title.trim().slice(0, 1).toUpperCase() || "•";
}

function updateOverlayLabel(value) {
  elements.backgroundOverlayValue.textContent = `${clampOverlay(value)}%`;
  elements.backgroundOverlay.style.setProperty("--range-progress", `${clampOverlay(value)}%`);
}

function clampOverlay(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, numericValue));
}

function createIcon(paths) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.classList.add("icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");

  paths.forEach((pathData) => {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  });

  return svg;
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);

    image.addEventListener("load", () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      cleanup();
      resolve(dimensions);
    });
    image.addEventListener("error", () => {
      cleanup();
      reject(new Error("Image decode failed"));
    });
    image.src = objectUrl;
  });
}
