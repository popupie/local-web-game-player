// @ts-nocheck

import { TEXT_LOG_DELAY_MS } from "@/player-runtime/bridge/constants";
import { textLogDedupeKey } from "@/shared/text";
import {
  cocosSourceIsVisible,
  createCocosOverlayAdapter,
} from "@/player-runtime/engines/cocos/overlay";
import {
  construct2SourceIsVisible,
  construct2TextSegments,
  createConstruct2OverlayAdapter,
} from "@/player-runtime/engines/construct2/overlay";
import { createRpgMakerOverlay } from "@/player-runtime/engines/rpgmaker_mvmz/overlay";
import {
  createTyranoOverlayAdapter,
  domSourceIsVisible,
  scaledCssLength,
} from "@/player-runtime/engines/tyrano/overlay";
import { createOverlayInputController } from "@/player-runtime/bridge/overlay/inputGuard";
import { createOverlayRenderer } from "@/player-runtime/bridge/overlay/renderer";
import { createOverlayState } from "@/player-runtime/bridge/overlay/state";
import { OVERLAY_STYLES } from "@/player-runtime/bridge/overlay/styles";

export function createTextOverlayBridge({ config, postParentMessage, settings }) {
  const overlayState = createOverlayState();
  const {
    clearGuardState,
    dictionaryGuardActive,
    focusGameTarget,
    installDictionaryGuardInputHooks,
    installOverlayFocusReturn,
  } = createOverlayInputController({ overlayState, postParentMessage, settings });
  const {
    entryIsVisible,
    ownerBelongsToScene,
    refreshRpgMakerFontMetrics,
    scheduleFlush,
  } = createOverlayRenderer({
    cocosSourceIsVisible,
    construct2SourceIsVisible,
    construct2TextSegments,
    domSourceIsVisible,
    ensureOverlayDom,
    overlayIsActive,
    overlayState,
    removeEntry,
    scaledCssLength,
  });
  const { install: installRpgMakerOverlayHooks } = createRpgMakerOverlay({
    entryIsVisible,
    overlayIsActive,
    overlayState,
    ownerBelongsToScene,
    refreshRpgMakerFontMetrics,
    removeEntry,
    scheduleFlush,
    upsertEntry,
  });
  const { install: installCocosOverlayHooks } = createCocosOverlayAdapter({
    domSourceId,
    ensureOverlayDom,
    overlayIsActive,
    overlayState,
    removeEntry,
    scheduleFlush,
    upsertEntry,
  });
  const { install: installConstruct2OverlayHooks } = createConstruct2OverlayAdapter({
    domSourceId,
    overlayIsActive,
    overlayState,
    removeEntry,
    upsertEntry,
  });
  const {
    install: installTyranoOverlayHooks,
    scheduleScan: scheduleTyranoScan,
  } = createTyranoOverlayAdapter({
    domSourceId,
    overlayIsActive,
    overlayState,
    removeEntry,
    scheduleFlush,
    upsertEntry,
  });

  function ensureOverlayDom() {
    if (!overlayState.style) {
      overlayState.style = document.createElement("style");
      overlayState.style.textContent = OVERLAY_STYLES;
      document.documentElement.appendChild(overlayState.style);
    }

    if (!overlayState.root) {
      overlayState.root = document.createElement("div");
      overlayState.root.id = "mz-player-text-overlay";
      document.documentElement.appendChild(overlayState.root);
      installOverlayFocusReturn();
    }
  }

  function refreshOverlayClasses() {
    ensureOverlayDom();
    const active = overlayIsActive();
    overlayState.root.classList.toggle("mz-player-text-overlay-active", active);
    overlayState.root.classList.toggle("mz-player-text-overlay-readable", settings.readableOverlay);
    overlayState.root.classList.toggle("mz-player-text-overlay-reader", settings.readerMode);
    if (!active) {
      clearOverlayEntries();
      clearGuardState();
    }
    scheduleTyranoScan();
    scheduleFlush();
  }

  function overlayIsActive() {
    return settings.overlayEnabled || settings.readableOverlay || settings.readerMode;
  }

  function domSourceId(source) {
    let id = overlayState.domSourceIds.get(source);
    if (!id) {
      id = overlayState.nextDomSourceId++;
      overlayState.domSourceIds.set(source, id);
    }
    return id;
  }

  function removeEntry(key, entry) {
    if (entry) forgetLineGroupsForEntry(key);
    if (entry.element) entry.element.remove();
    overlayState.entries.delete(key);
  }

  function forgetLineGroupsForEntry(entryKey) {
    for (const [key, group] of overlayState.lineGroups) {
      if (group.entryKey === entryKey) overlayState.lineGroups.delete(key);
    }
  }

  function clearOverlayEntries() {
    if (overlayState.root) overlayState.root.replaceChildren();
    overlayState.entries.clear();
    overlayState.lineGroups.clear();
    for (const timer of overlayState.textLogTimers.values()) window.clearTimeout(timer);
    overlayState.textLogTimers.clear();
    overlayState.textLogValues.clear();
    overlayState.raf = 0;
  }

  function upsertEntry(key, next) {
    const current = overlayState.entries.get(key) || {};
    const textChanged = current.text !== next.text;
    const logTextChanged = current.logText !== next.logText;
    Object.assign(current, next);
    overlayState.entries.set(key, current);
    if (textChanged || logTextChanged) scheduleTextLog(key, current);
    scheduleFlush();
  }

  function scheduleTextLog(key, entry) {
    if (entry.skipTextLog) return;
    if (!entryIsLoggable(entry)) return;
    const text = String(entry.logText ?? entry.text ?? "");
    const dedupeKey = textLogDedupeKey(text);
    if (!dedupeKey) return;

    replaceTextLogTimer(key, () => {
      overlayState.textLogTimers.delete(key);
      if (overlayState.textLogValues.get(key) === dedupeKey) return;
      overlayState.textLogValues.set(key, dedupeKey);
      postParentMessage({ type: "text-log", gameId: config.gameId, text, at: Date.now() });
    });
  }

  function replaceTextLogTimer(key, callback) {
    const existing = overlayState.textLogTimers.get(key);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(callback, TEXT_LOG_DELAY_MS);
    overlayState.textLogTimers.set(key, timer);
  }

  function entryIsLoggable(entry) {
    if (entry?.domSource || entry?.constructSource || entry?.cocosSource) return true;
    const name = entry?.owner?.constructor?.name || "";
    return /^(Window_Message|Window_ChoiceList|Window_NameBox|Window_ScrollText)$/.test(name);
  }


  return {
    clearGuardState,
    dictionaryGuardActive,
    ensureOverlayDom,
    focusGameTarget,
    installDictionaryGuardInputHooks,
    installConstruct2OverlayHooks,
    installCocosOverlayHooks,
    installRpgMakerOverlayHooks,
    installTyranoOverlayHooks,
    refreshOverlayClasses,
    scheduleFlush,
  };
}
