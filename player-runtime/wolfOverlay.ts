import {
  findWolfTextBounds,
  normalizeWolfMessage,
  readWolfRuntimeTextState,
} from "./wolfText";
import type { WolfTextBounds } from "./wolfText";

export type WolfPlayerSettings = {
  reservedKeys?: Array<{
    code: string;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    action: string;
  }>;
  dictionaryDismissGuard?: {
    enabled?: boolean;
    triggers?: Array<{
      code?: string;
      altKey?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
    }>;
  };
  overlayEnabled?: boolean;
  readableOverlay?: boolean;
  readerMode?: boolean;
};

type WolfOverlayOptions = {
  gameId: string;
  initialSettings?: WolfPlayerSettings;
  getHeap: () => Int8Array | undefined;
  getCanvas: () => HTMLCanvasElement | null;
};

type WolfParentMessage = {
  type?: string;
  enabled?: boolean;
  settings?: WolfPlayerSettings;
};

function normalizeSettings(next: WolfPlayerSettings | undefined) {
  const overlayEnabled = Boolean(next?.overlayEnabled);
  return {
    reservedKeys: Array.isArray(next?.reservedKeys) ? next.reservedKeys : [],
    dictionaryDismissGuard: next?.dictionaryDismissGuard ?? { enabled: true, triggers: [] },
    overlayEnabled,
    readableOverlay: overlayEnabled && Boolean(next?.readableOverlay),
    readerMode: overlayEnabled,
  };
}

function exactModifiers(event: KeyboardEvent, chord: {
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}) {
  return event.altKey === Boolean(chord.altKey)
    && event.ctrlKey === Boolean(chord.ctrlKey)
    && event.metaKey === Boolean(chord.metaKey)
    && event.shiftKey === Boolean(chord.shiftKey);
}

export function installWolfOverlay(options: WolfOverlayOptions) {
  let settings = normalizeSettings(options.initialSettings);
  let messageText = "";
  let choiceText = "";
  let callbackText = "";
  let messageTextBounds: WolfTextBounds | undefined;
  let choiceTextBounds: WolfTextBounds | undefined;
  let callbackTextBounds: WolfTextBounds | undefined;
  let selectedChoice = -1;
  let structuredRuntimeDetected = false;
  let lastPublishedMessage = "";
  let lastPublishedChoices = "";
  let structuredBoundsToken = 0;
  let overlayFontReady = false;
  let viewportCandidate = "";
  let viewportCandidateSamples = 0;
  let lastReportedViewport = "";
  let lastCanvasLayout = "";

  // Browser Woditor normally owns its page layout. Inside our already-sized
  // iframe that creates a second, competing layout system, so normalize only
  // its known containers and let the parent player own the viewport aspect.
  document.documentElement.classList.add("mz-player-browser-woditor");
  const style = document.createElement("style");
  style.id = "mz-player-wolf-compatibility";
  style.textContent = `
    @font-face {
      font-family: "Wolf Player Text";
      src: url("DefaultFont.ttf") format("truetype");
      font-display: swap;
    }

    canvas:focus,
    canvas:focus-visible {
      outline: none !important;
    }

    html.mz-player-browser-woditor,
    html.mz-player-browser-woditor body,
    html.mz-player-browser-woditor #outer,
    html.mz-player-browser-woditor #container,
    html.mz-player-browser-woditor #screen-holder-main,
    html.mz-player-browser-woditor #main,
    html.mz-player-browser-woditor #screen,
    html.mz-player-browser-woditor #main-content {
      box-sizing: border-box !important;
      width: 100% !important;
      height: 100% !important;
      min-width: 0 !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
    }

    html.mz-player-browser-woditor #outer,
    html.mz-player-browser-woditor #container,
    html.mz-player-browser-woditor #main,
    html.mz-player-browser-woditor #screen,
    html.mz-player-browser-woditor #main-content {
      display: block !important;
    }

    html.mz-player-browser-woditor #screen-holder-left,
    html.mz-player-browser-woditor #screen-holder-right,
    html.mz-player-browser-woditor #settings {
      display: none !important;
    }

    html.mz-player-browser-woditor #main {
      position: relative !important;
      top: 0 !important;
    }

    html.mz-player-browser-woditor #canvas {
      position: absolute !important;
      inset: auto !important;
      left: 50% !important;
      top: 50% !important;
      width: var(--mz-player-wolf-canvas-width, 100%) !important;
      height: var(--mz-player-wolf-canvas-height, 100%) !important;
      max-width: 100% !important;
      max-height: 100% !important;
      margin: 0 !important;
      translate: -50% -50% !important;
      transform: none !important;
    }

    #mz-player-text-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: none;
      pointer-events: none;
      font-synthesis: none;
      text-rendering: optimizeLegibility;
      user-select: text !important;
      -webkit-user-select: text !important;
    }

    #mz-player-text-overlay.mz-player-text-overlay-active {
      display: block;
    }

    #mz-player-text-overlay .mz-player-text-overlay-entry {
      position: fixed;
      box-sizing: border-box;
      display: none;
      margin: 0;
      border: 0;
      padding: 0;
      overflow: visible;
      color: transparent;
      background: transparent;
      text-shadow: none;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: "Wolf Player Text", sans-serif;
      user-select: text !important;
      -webkit-user-select: text !important;
    }

    #mz-player-text-overlay .mz-player-text-overlay-entry[data-visible="true"] {
      display: block;
    }

    #mz-player-text-overlay.mz-player-text-overlay-readable .mz-player-text-overlay-entry {
      color: rgba(255, 255, 255, 0.97);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.98), 0 0 4px rgba(0, 0, 0, 0.9);
    }

    #mz-player-text-overlay.mz-player-text-overlay-reader .mz-player-text-overlay-entry {
      pointer-events: auto;
      cursor: text;
    }

    #mz-player-text-overlay .mz-player-text-overlay-line {
      position: absolute;
      display: block;
      white-space: pre;
      transform-origin: left top;
    }
  `;
  document.documentElement.appendChild(style);

  const root = document.createElement("div");
  root.id = "mz-player-text-overlay";
  root.dataset.capture = "runtime-fields";
  const messageEntry = document.createElement("div");
  messageEntry.className = "mz-player-text-overlay-entry mz-player-text-overlay-message";
  const choiceEntry = document.createElement("div");
  choiceEntry.className = "mz-player-text-overlay-entry mz-player-text-overlay-choices";
  root.append(messageEntry, choiceEntry);
  document.documentElement.appendChild(root);
  const captureCanvas = document.createElement("canvas");

  void document.fonts.load('16px "Wolf Player Text"').then(
    () => {
      overlayFontReady = true;
      refreshOverlay();
    },
    () => {
      overlayFontReady = true;
      refreshOverlay();
    },
  );

  function postParent(message: object) {
    window.parent.postMessage(message, window.location.origin);
  }

  function overlayActive() {
    return settings.overlayEnabled || settings.readableOverlay || settings.readerMode;
  }

  function syncCanvasViewport(canvas: HTMLCanvasElement) {
    if (!options.getHeap() || canvas.width <= 0 || canvas.height <= 0) return;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    if (viewportWidth <= 0 || viewportHeight <= 0) return;
    const scale = Math.min(viewportWidth / canvas.width, viewportHeight / canvas.height);
    const cssWidth = canvas.width * scale;
    const cssHeight = canvas.height * scale;
    const layoutKey = `${canvas.width}x${canvas.height}:${viewportWidth}x${viewportHeight}`;
    if (layoutKey !== lastCanvasLayout) {
      lastCanvasLayout = layoutKey;
      document.documentElement.style.setProperty(
        "--mz-player-wolf-canvas-width",
        `${cssWidth}px`,
      );
      document.documentElement.style.setProperty(
        "--mz-player-wolf-canvas-height",
        `${cssHeight}px`,
      );
    }

    const viewportKey = `${canvas.width}x${canvas.height}`;
    if (viewportKey === lastReportedViewport) return;
    if (viewportKey !== viewportCandidate) {
      viewportCandidate = viewportKey;
      viewportCandidateSamples = 1;
      return;
    }
    viewportCandidateSamples += 1;
    if (viewportCandidateSamples < 2) return;
    lastReportedViewport = viewportKey;
    postParent({ type: "game-viewport", width: canvas.width, height: canvas.height });
  }

  function positionBoundedEntry(
    entry: HTMLElement,
    bounds: WolfTextBounds,
    canvas: HTMLCanvasElement,
    rect: DOMRect,
  ) {
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const left = rect.left + bounds.left * scaleX;
    const top = rect.top + bounds.top * scaleY;
    entry.style.left = `${Math.round(left)}px`;
    entry.style.top = `${Math.round(top)}px`;
    entry.style.width = `${Math.round(Math.min(
      rect.right - left,
      Math.max(bounds.width * scaleX, rect.width * 0.08),
    ))}px`;
    entry.style.minHeight = `${Math.round(bounds.height * scaleY)}px`;
    entry.style.fontSize = `${Math.max(8, bounds.fontSize * scaleY)}px`;
    entry.style.lineHeight = "1";

    const lines = Array.from(entry.children) as HTMLElement[];
    for (const [index, line] of lines.entries()) {
      const lineBounds = bounds.lines[index];
      if (!lineBounds) {
        line.style.display = "none";
        continue;
      }
      line.style.display = "block";
      line.style.left = `${(lineBounds.left - bounds.left) * scaleX}px`;
      line.style.top = `${(lineBounds.top - bounds.top) * scaleY}px`;
      line.style.width = "max-content";
      line.style.height = "auto";
      line.style.lineHeight = "1";
      line.style.transform = "none";
      const naturalRect = line.getBoundingClientRect();
      const targetWidth = Math.max(1, lineBounds.width * scaleX);
      const targetHeight = Math.max(1, lineBounds.height * scaleY);
      const horizontalScale = naturalRect.width > 0 ? targetWidth / naturalRect.width : 1;
      const verticalScale = naturalRect.height > 0 ? targetHeight / naturalRect.height : 1;
      line.style.transform = `scale(${horizontalScale}, ${verticalScale})`;
    }
  }

  function positionEntries() {
    const canvas = options.getCanvas();
    if (!canvas) return;
    syncCanvasViewport(canvas);
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const activeMessageBounds = messageText ? messageTextBounds : callbackTextBounds;
    if (activeMessageBounds) {
      positionBoundedEntry(messageEntry, activeMessageBounds, canvas, rect);
    }
    if (choiceTextBounds) {
      positionBoundedEntry(choiceEntry, choiceTextBounds, canvas, rect);
    }
  }

  function setEntryText(entry: HTMLElement, text: string) {
    if (entry.dataset.gameText === text) return;
    entry.replaceChildren();
    if (text) {
      for (const value of text.split("\n")) {
        const line = document.createElement("span");
        line.className = "mz-player-text-overlay-line";
        line.textContent = value;
        entry.appendChild(line);
      }
      entry.setAttribute("aria-label", text);
      entry.dataset.gameText = text;
    } else {
      entry.removeAttribute("aria-label");
      delete entry.dataset.gameText;
    }
  }

  function setChoiceLines(choices: string[]) {
    choiceEntry.replaceChildren();
    for (const [index, choice] of choices.entries()) {
      const line = document.createElement("span");
      line.className = "mz-player-choice-line mz-player-text-overlay-line";
      line.dataset.selected = String(index === selectedChoice);
      line.textContent = choice;
      choiceEntry.appendChild(line);
    }
    choiceText = choices.join("\n");
    if (choiceText) {
      choiceEntry.setAttribute("aria-label", choiceText);
      choiceEntry.dataset.gameText = choiceText;
    } else {
      choiceEntry.removeAttribute("aria-label");
      delete choiceEntry.dataset.gameText;
    }
  }

  function refreshOverlay() {
    const visibleMessage = messageText || callbackText;
    const visibleMessageBounds = messageText ? messageTextBounds : callbackTextBounds;
    setEntryText(messageEntry, visibleMessage);
    const messageVisible = Boolean(
      overlayActive() && overlayFontReady && visibleMessage && visibleMessageBounds,
    );
    const choicesVisible = Boolean(
      overlayActive() && overlayFontReady && choiceText && choiceTextBounds,
    );
    messageEntry.dataset.visible = String(messageVisible);
    choiceEntry.dataset.visible = String(choicesVisible);
    root.classList.toggle("mz-player-text-overlay-active", messageVisible || choicesVisible);
    root.classList.toggle("mz-player-text-overlay-readable", settings.readableOverlay);
    root.classList.toggle("mz-player-text-overlay-reader", settings.readerMode);
    positionEntries();
  }

  function publishText(text: string, source: "message" | "choices") {
    if (!text) return;
    postParent({ type: "text-log", gameId: options.gameId, text, source, at: Date.now() });
  }

  function readCanvasPixels() {
    const canvas = options.getCanvas();
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return undefined;
    captureCanvas.width = canvas.width;
    captureCanvas.height = canvas.height;
    const context = captureCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    try {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(canvas, 0, 0);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
      return { canvas, pixels };
    } catch {
      return undefined;
    }
  }

  function scheduleStructuredBounds(expectedMessage: string, expectedChoices: string) {
    const token = ++structuredBoundsToken;
    for (const delay of [50, 150, 300, 550, 850]) {
      window.setTimeout(() => {
        if (
          token !== structuredBoundsToken
          || expectedMessage !== messageText
          || expectedChoices !== choiceText
        ) return;
        const frame = readCanvasPixels();
        if (!frame) return;
        if (expectedMessage) {
          const bounds = findWolfTextBounds(
            frame.pixels,
            frame.canvas.width,
            frame.canvas.height,
            expectedMessage,
          );
          if (bounds) messageTextBounds = bounds;
        }
        if (expectedChoices) {
          const bounds = findWolfTextBounds(
            frame.pixels,
            frame.canvas.width,
            frame.canvas.height,
            expectedChoices,
          );
          if (bounds) choiceTextBounds = bounds;
        }
        refreshOverlay();
      }, delay);
    }
  }

  function scheduleCallbackBounds(expectedMessage: string) {
    const token = ++structuredBoundsToken;
    for (const delay of [50, 150, 300, 550, 850]) {
      window.setTimeout(() => {
        if (
          token !== structuredBoundsToken
          || expectedMessage !== callbackText
          || structuredRuntimeDetected
          || messageText
          || choiceText
        ) return;
        const frame = readCanvasPixels();
        if (!frame) return;
        const bounds = findWolfTextBounds(
          frame.pixels,
          frame.canvas.width,
          frame.canvas.height,
          expectedMessage,
        );
        if (bounds) callbackTextBounds = bounds;
        refreshOverlay();
      }, delay);
    }
  }

  function pollRuntimeText() {
    if (!overlayActive()) return;
    const state = readWolfRuntimeTextState(options.getHeap());
    if (!state) return;
    if (!structuredRuntimeDetected) {
      callbackText = "";
      callbackTextBounds = undefined;
    }
    structuredRuntimeDetected = true;
    const nextChoiceText = state.choices.join("\n");
    const changed = state.message !== messageText
      || nextChoiceText !== choiceText
      || state.selectedChoice !== selectedChoice;
    if (!changed) return;
    messageText = state.message;
    messageTextBounds = undefined;
    choiceTextBounds = undefined;
    selectedChoice = state.selectedChoice;
    setChoiceLines(state.choices);
    if (!messageText) lastPublishedMessage = "";
    if (!choiceText) lastPublishedChoices = "";
    if (messageText && messageText !== lastPublishedMessage) {
      lastPublishedMessage = messageText;
      publishText(messageText, "message");
    }
    if (choiceText && choiceText !== lastPublishedChoices) {
      lastPublishedChoices = choiceText;
      publishText(choiceText, "choices");
    }
    refreshOverlay();
    scheduleStructuredBounds(messageText, choiceText);
  }

  function captureText(value: string) {
    if (!overlayActive() || structuredRuntimeDetected || messageText || choiceText) return;
    const text = normalizeWolfMessage(value);
    if (!text || text === callbackText) return;
    callbackText = text;
    callbackTextBounds = undefined;
    publishText(text, "message");
    refreshOverlay();
    scheduleCallbackBounds(text);
  }

  function focusGame() {
    const canvas = options.getCanvas();
    const target = canvas ?? document.body ?? document.documentElement;
    try {
      window.focus();
      if (target instanceof HTMLElement && !target.hasAttribute("tabindex")) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    } catch {
      // Browser focus is best effort.
    }
  }

  function noteGameInput(event: Event) {
    if (event.target === messageEntry || messageEntry.contains(event.target as Node)) return;
    if (event.target === choiceEntry || choiceEntry.contains(event.target as Node)) return;
    if (!structuredRuntimeDetected && callbackText) {
      callbackText = "";
      callbackTextBounds = undefined;
      refreshOverlay();
    }
  }

  function handleParentMessage(event: MessageEvent<WolfParentMessage>) {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "focus-game") {
      focusGame();
      return;
    }
    if (message.type === "player-settings") settings = normalizeSettings(message.settings);
    if (message.type === "overlay-visible") {
      settings = normalizeSettings({ ...settings, overlayEnabled: Boolean(message.enabled) });
    }
    if (message.type === "reader-mode" && message.enabled) {
      settings = normalizeSettings({ ...settings, overlayEnabled: true, readerMode: true });
    }
    refreshOverlay();
    pollRuntimeText();
    postParent({
      type: "overlay-status",
      overlayEnabled: settings.overlayEnabled,
      readerMode: settings.readerMode,
    });
  }

  function handleReservedKey(event: KeyboardEvent) {
    if (event.type !== "keydown") return;
    const key = settings.reservedKeys.find(
      (item) => item.code === event.code && exactModifiers(event, item),
    );
    if (!key) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    postParent({ type: "reserved-key", action: key.action, code: event.code });
  }

  function handleDictionaryGuard(event: KeyboardEvent) {
    const guard = settings.dictionaryDismissGuard;
    if (!overlayActive() || guard?.enabled === false || !Array.isArray(guard?.triggers)) return;
    const matched = guard.triggers.some((trigger) => {
      if (!exactModifiers(event, trigger)) return false;
      if (trigger.code) return trigger.code === event.code;
      return (trigger.altKey && /^Alt/u.test(event.code))
        || (trigger.ctrlKey && /^Control/u.test(event.code))
        || (trigger.metaKey && /^Meta/u.test(event.code))
        || (trigger.shiftKey && /^Shift/u.test(event.code));
    });
    if (!matched) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  for (const entry of [messageEntry, choiceEntry]) {
    for (const type of [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "contextmenu",
      "touchstart",
      "touchend",
    ]) {
      entry.addEventListener(type, (event) => {
        event.stopPropagation();
        if (["pointerup", "mouseup", "click", "touchend"].includes(type) && settings.readerMode) {
          postParent({ type: "return-focus" });
        }
      }, true);
    }
  }
  for (const type of ["keydown", "keypress", "keyup"] as const) {
    window.addEventListener(type, handleReservedKey, true);
    window.addEventListener(type, handleDictionaryGuard, true);
  }
  window.addEventListener("message", handleParentMessage);
  window.addEventListener("resize", positionEntries);
  window.addEventListener("pointerdown", noteGameInput, true);
  window.addEventListener("mousedown", noteGameInput, true);
  window.addEventListener("touchstart", noteGameInput, true);
  window.addEventListener("keydown", noteGameInput, true);
  window.setInterval(positionEntries, 250);
  window.setInterval(pollRuntimeText, 50);
  refreshOverlay();
  postParent({
    type: "overlay-status",
    overlayEnabled: settings.overlayEnabled,
    readerMode: settings.readerMode,
  });
  return { captureText };
}
