/* Generated from player-runtime/bridge/*.ts by scripts/build-player-runtime.mjs. */
(() => {
  // player-runtime/bridge/keyEvents.ts
  function exactModifierMatch(event, trigger) {
    return Boolean(event.altKey) === Boolean(trigger.altKey) && Boolean(event.ctrlKey) === Boolean(trigger.ctrlKey) && Boolean(event.metaKey) === Boolean(trigger.metaKey) && Boolean(event.shiftKey) === Boolean(trigger.shiftKey);
  }
  function keyEventMatchesChord(event, chord) {
    return event.code === chord.code && exactModifierMatch(event, chord);
  }
  function positiveFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  // player-runtime/bridge/parentBridge.ts
  function postParent(message) {
    try {
      window.parent.postMessage(message, window.location.origin);
    } catch {
      window.parent.postMessage(message, "*");
    }
  }
  function createParentBridge({ overlay, postParentMessage, settings, viewport }) {
    function installReservedKeys() {
      window.addEventListener("keydown", handleReservedKeyEvent, true);
    }
    function handleReservedKeyEvent(event) {
      const match = reservedKeyForEvent(event);
      if (!match) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!applyReservedKeyAction(match.action)) return;
      overlay.refreshOverlayClasses();
      postParentMessage({ type: "reserved-key", action: match.action, code: event.code });
      postStatus();
    }
    function reservedKeyForEvent(event) {
      return (settings.reservedKeys || []).find((key) => keyEventMatchesChord(event, key));
    }
    function applyReservedKeyAction(action) {
      if (action === "toggleOverlay") {
        settings.replace(settings.overlayEnabled ? { ...settings.current, overlayEnabled: false, readableOverlay: false, readerMode: false } : { ...settings.current, overlayEnabled: true, readableOverlay: false, readerMode: true });
        return true;
      }
      if (action === "toggleReader") {
        if (!settings.overlayEnabled) return false;
        settings.patch({ readableOverlay: !settings.readableOverlay, readerMode: true });
        return true;
      }
      return true;
    }
    function installMessageBridge() {
      window.addEventListener("message", handleParentMessage);
    }
    function handleParentMessage(event) {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "focus-game") {
        overlay.refreshOverlayClasses();
        overlay.focusGameTarget();
        return;
      }
      if (message.type === "player-viewport") {
        viewport.updatePlayerViewport(message);
        return;
      }
      applyParentSettingsMessage(message);
      overlay.refreshOverlayClasses();
      postStatus();
    }
    function applyParentSettingsMessage(message) {
      if (message.type === "player-settings") {
        settings.replace(message.settings);
        if (!overlay.dictionaryGuardActive()) overlay.clearGuardState();
      }
      if (message.type === "overlay-visible") {
        settings.patch({ overlayEnabled: Boolean(message.enabled) });
      }
      if (message.type === "reader-mode") {
        settings.patch({ overlayEnabled: message.enabled ? true : settings.overlayEnabled });
      }
    }
    function installErrorBridge() {
      window.addEventListener("error", (event) => {
        postParentMessage({ type: "runtime-error", message: String(event.message || "Runtime error"), stack: event.error && event.error.stack });
      });
      window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason || {};
        postParentMessage({ type: "runtime-error", message: String(reason.message || reason || "Unhandled rejection"), stack: reason.stack });
      });
    }
    function postStatus() {
      postParentMessage({ type: "overlay-status", overlayEnabled: settings.overlayEnabled, readerMode: settings.readerMode });
    }
    return {
      installErrorBridge,
      installMessageBridge,
      installReservedKeys,
      postStatus
    };
  }

  // player-runtime/bridge/settings.ts
  function createSettingsStore(initialSettings) {
    let current = normalizeSettings(initialSettings);
    return {
      get current() {
        return current;
      },
      replace(next) {
        current = normalizeSettings(next);
        return current;
      },
      patch(patch) {
        current = normalizeSettings({ ...current, ...patch });
        return current;
      },
      get reservedKeys() {
        return current.reservedKeys;
      },
      get dictionaryDismissGuard() {
        return current.dictionaryDismissGuard;
      },
      get overlayEnabled() {
        return current.overlayEnabled;
      },
      get readableOverlay() {
        return current.readableOverlay;
      },
      get readerMode() {
        return current.readerMode;
      }
    };
  }
  function normalizeSettings(next) {
    const normalized = next || {};
    const overlayEnabled = Boolean(normalized.overlayEnabled);
    return {
      reservedKeys: normalized.reservedKeys || [],
      dictionaryDismissGuard: normalizeDictionaryDismissGuard(normalized.dictionaryDismissGuard),
      overlayEnabled,
      readableOverlay: overlayEnabled && Boolean(normalized.readableOverlay),
      readerMode: overlayEnabled
    };
  }
  function normalizeDictionaryDismissGuard(next) {
    const guard = next || {};
    const triggers = Array.isArray(guard.triggers) && guard.triggers.length > 0 ? guard.triggers.map(normalizeKeyChord).filter(Boolean) : [];
    return {
      enabled: guard.enabled !== false,
      triggers
    };
  }
  function normalizeKeyChord(chord) {
    if (!chord || typeof chord !== "object") return null;
    return {
      code: typeof chord.code === "string" && chord.code ? chord.code : void 0,
      altKey: Boolean(chord.altKey),
      ctrlKey: Boolean(chord.ctrlKey),
      metaKey: Boolean(chord.metaKey),
      shiftKey: Boolean(chord.shiftKey),
      label: typeof chord.label === "string" && chord.label ? chord.label : "Key"
    };
  }

  // player-runtime/bridge/storageNamespace.ts
  function patchLocalStorage(namespace) {
    const original = {
      getItem: Storage.prototype.getItem,
      setItem: Storage.prototype.setItem,
      removeItem: Storage.prototype.removeItem,
      clear: Storage.prototype.clear,
      key: Storage.prototype.key,
      length: Object.getOwnPropertyDescriptor(Storage.prototype, "length")
    };
    const namespaced = (key) => String(key).startsWith(namespace) ? String(key) : `${namespace}${String(key)}`;
    const isLocal = (target) => target === window.localStorage;
    const localKeys = () => {
      const keys = [];
      for (let index = 0; index < original.length.get.call(window.localStorage); index += 1) {
        const key = original.key.call(window.localStorage, index);
        if (key && key.startsWith(namespace)) keys.push(key);
      }
      return keys;
    };
    Storage.prototype.getItem = function(key) {
      return original.getItem.call(this, isLocal(this) ? namespaced(key) : key);
    };
    Storage.prototype.setItem = function(key, value) {
      return original.setItem.call(this, isLocal(this) ? namespaced(key) : key, value);
    };
    Storage.prototype.removeItem = function(key) {
      return original.removeItem.call(this, isLocal(this) ? namespaced(key) : key);
    };
    Storage.prototype.clear = function() {
      if (!isLocal(this)) return original.clear.call(this);
      for (const key of localKeys()) original.removeItem.call(this, key);
      return void 0;
    };
    Storage.prototype.key = function(index) {
      if (!isLocal(this)) return original.key.call(this, index);
      const key = localKeys()[index] || null;
      return key ? key.slice(namespace.length) : null;
    };
    try {
      Object.defineProperty(Storage.prototype, "length", {
        configurable: true,
        get() {
          if (this !== window.localStorage) return original.length.get.call(this);
          return localKeys().length;
        }
      });
    } catch {
    }
  }

  // player-runtime/bridge/constants.ts
  var FOCUS_RETURN_EVENT_TYPES = ["pointerup", "mouseup", "click", "touchend"];
  var TEXT_LOG_DELAY_MS = 140;

  // player-runtime/bridge/cocos.ts
  var COCOS_NAMED_ENTITIES = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: "\xA0",
    quot: '"'
  };
  var COCOS_EMOJI_FONT_FALLBACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  function resolveCocosEngine(system) {
    if (!system || typeof system.get !== "function") return null;
    const candidates = [];
    try {
      if (typeof system.resolve === "function") candidates.push(system.resolve("cc"));
    } catch {
    }
    candidates.push("cc");
    for (const id of candidates) {
      if (!id) continue;
      try {
        const engine = system.get(id);
        if (isCocosEngine(engine)) return engine;
      } catch {
      }
    }
    try {
      if (typeof system.entries === "function") {
        for (const [, module] of system.entries()) {
          if (isCocosEngine(module)) return module;
        }
      }
    } catch {
    }
    return null;
  }
  function isCocosEngine(value) {
    return Boolean(
      value && value.director && typeof value.director.getScene === "function" && value.UITransform && (value.Label || value.RichText)
    );
  }
  function plainCocosText(value) {
    return String(value ?? "").replace(/<br\s*\/?>/giu, "\n").replace(/<img\b[^>]*>/giu, "").replace(/<[^>]+>/gu, "").replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/giu, (entity, decimal, hexadecimal, named) => {
      if (decimal) return safeCodePoint(Number.parseInt(decimal, 10), entity);
      if (hexadecimal) return safeCodePoint(Number.parseInt(hexadecimal, 16), entity);
      return COCOS_NAMED_ENTITIES[String(named).toLowerCase()] ?? entity;
    }).replace(/\u00a0/gu, " ").trim();
  }
  function safeCodePoint(value, fallback) {
    if (!Number.isInteger(value) || value < 0 || value > 1114111) return fallback;
    try {
      return String.fromCodePoint(value);
    } catch {
      return fallback;
    }
  }
  function cocosTextAlign(value) {
    const alignment = Number(value);
    if (alignment === 1) return "center";
    if (alignment === 2) return "right";
    return "left";
  }
  function cocosVerticalAlignFactor(value) {
    const alignment = Number(value);
    if (alignment === 1) return 0.5;
    if (alignment === 2) return 1;
    return 0;
  }
  function cocosFontFamily(source) {
    const renderedFamily = source?.textStyle?.fontFamily || source?._textStyle?.fontFamily;
    const usesSystemFont = source?.useSystemFont ?? source?._isSystemFontUsed;
    const assetFamily = source?.font?._nativeAsset || source?._font?._nativeAsset;
    const systemFamily = source?.fontFamily || source?._fontFamily;
    const family = renderedFamily || (usesSystemFont === false ? assetFamily : systemFamily) || assetFamily || systemFamily || "Arial";
    return String(family).trim() || "Arial";
  }
  function cocosCssFontFamily(source) {
    const family = cocosFontFamily(source);
    return `${family}, ${COCOS_EMOJI_FONT_FALLBACK}`;
  }
  function cocosFontMetrics(source, fallbackRenderScale = 1) {
    const configuredFontSize = firstPositiveNumber(source?.fontSize, source?._fontSize) || 24;
    const renderedFontSize = firstPositiveNumber(source?.actualFontSize, source?._actualFontSize);
    const renderScale = firstPositiveNumber(
      source?.textStyle?.fontScale,
      source?._textStyle?.fontScale,
      fallbackRenderScale
    ) || 1;
    const overflow = Number(source?.overflow ?? source?._overflow);
    const fontSize = overflow === 2 && renderedFontSize ? renderedFontSize / renderScale : configuredFontSize;
    const configuredLineHeight = firstPositiveNumber(source?.lineHeight, source?._lineHeight);
    const lineHeight = configuredLineHeight ? configuredLineHeight * (fontSize / configuredFontSize) : fontSize;
    return { fontSize, lineHeight };
  }
  function cocosRenderedText(source, fallbackText) {
    const segments = source?._segments;
    if (Array.isArray(segments) && segments.length > 0) {
      const segmentLineCount = segments.reduce(
        (count, segment) => Math.max(count, Number(segment?.lineCount) || 1),
        1
      );
      const lineCount = Math.max(1, Number(source?._lineCount) || segmentLineCount);
      const lines = Array.from({ length: lineCount }, () => "");
      let hasText = false;
      for (const segment of segments) {
        const value = segment?.comp?.string ?? segment?.comp?._string;
        if (value === void 0 || value === null) continue;
        const index = Math.min(lineCount - 1, Math.max(0, (Number(segment?.lineCount) || 1) - 1));
        lines[index] += String(value);
        hasText = true;
      }
      if (hasText) return lines.join("\n");
    }
    const layoutData = source?.textLayoutData || source?._textLayoutData;
    if (Array.isArray(layoutData?.parsedString) && layoutData.parsedString.length > 0) {
      return layoutData.parsedString.map((line) => String(line ?? "")).join("\n");
    }
    return String(fallbackText ?? "");
  }
  function firstPositiveNumber(...values) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return number;
    }
    return 0;
  }
  function cocosWorldToScreen(camera, Vec3, world) {
    if (!camera || typeof camera.worldToScreen !== "function" || typeof Vec3 !== "function") {
      return null;
    }
    return camera.worldToScreen(new Vec3(), world);
  }
  function cocosCssRectFromScreenPoints(points, canvasRect, canvasWidth, canvasHeight) {
    if (!Array.isArray(points) || points.length < 2) return null;
    if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) return null;
    const finitePoints = points.filter(
      (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)
    );
    if (finitePoints.length !== points.length) return null;
    const pixelWidth = Number(canvasWidth) || canvasRect.width;
    const pixelHeight = Number(canvasHeight) || canvasRect.height;
    const scaleX = canvasRect.width / pixelWidth;
    const scaleY = canvasRect.height / pixelHeight;
    const minX = Math.min(...finitePoints.map((point) => point.x));
    const maxX = Math.max(...finitePoints.map((point) => point.x));
    const minY = Math.min(...finitePoints.map((point) => point.y));
    const maxY = Math.max(...finitePoints.map((point) => point.y));
    return {
      left: canvasRect.left + minX * scaleX,
      top: canvasRect.top + (pixelHeight - maxY) * scaleY,
      width: Math.max(1, (maxX - minX) * scaleX),
      height: Math.max(1, (maxY - minY) * scaleY)
    };
  }
  function cocosCssTransformFromScreenPoints(points, canvasRect, canvasWidth, canvasHeight, localWidth, localHeight) {
    if (!Array.isArray(points) || points.length !== 4) return null;
    if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) return null;
    const width = Number(localWidth);
    const height = Number(localHeight);
    if (!(width > 0) || !(height > 0)) return null;
    const pixelWidth = Number(canvasWidth) || canvasRect.width;
    const pixelHeight = Number(canvasHeight) || canvasRect.height;
    const scaleX = canvasRect.width / pixelWidth;
    const scaleY = canvasRect.height / pixelHeight;
    const cssPoints = points.map((point) => ({
      x: canvasRect.left + Number(point?.x) * scaleX,
      y: canvasRect.top + (pixelHeight - Number(point?.y)) * scaleY
    }));
    if (cssPoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      return null;
    }
    const [bottomLeft, , topRight, topLeft] = cssPoints;
    return {
      left: topLeft.x,
      top: topLeft.y,
      width,
      height,
      matrix: {
        a: (topRight.x - topLeft.x) / width,
        b: (topRight.y - topLeft.y) / width,
        c: (bottomLeft.x - topLeft.x) / height,
        d: (bottomLeft.y - topLeft.y) / height
      },
      bounds: {
        left: Math.min(...cssPoints.map((point) => point.x)),
        top: Math.min(...cssPoints.map((point) => point.y)),
        right: Math.max(...cssPoints.map((point) => point.x)),
        bottom: Math.max(...cssPoints.map((point) => point.y))
      }
    };
  }

  // player-runtime/bridge/textOverlayStyle.ts
  var EMOJI_FONT_FALLBACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  var EMOJI_FONT_NAMES = /* @__PURE__ */ new Set([
    "apple color emoji",
    "segoe ui emoji",
    "noto color emoji"
  ]);
  var GENERIC_FONT_FAMILIES = /* @__PURE__ */ new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-serif",
    "ui-sans-serif",
    "ui-monospace",
    "ui-rounded",
    "emoji",
    "math",
    "fangsong"
  ]);
  function fontFamilyWithEmojiFallback(value) {
    const family = String(value || "sans-serif").trim() || "sans-serif";
    const families = splitFontFamilies(family);
    const withoutEmoji = families.filter((item) => !EMOJI_FONT_NAMES.has(normalizeFontFamily(item)));
    const genericIndex = withoutEmoji.findIndex((item) => GENERIC_FONT_FAMILIES.has(normalizeFontFamily(item)));
    const insertionIndex = genericIndex < 0 ? withoutEmoji.length : genericIndex;
    withoutEmoji.splice(
      insertionIndex,
      0,
      '"Apple Color Emoji"',
      '"Segoe UI Emoji"',
      '"Noto Color Emoji"'
    );
    if (genericIndex < 0) withoutEmoji.push("sans-serif");
    return withoutEmoji.join(", ") || EMOJI_FONT_FALLBACK;
  }
  function canvasFontTraits(context, bitmap) {
    const font = String(context?.font || "");
    const weightMatch = font.match(/(?:^|\s)([1-9]00|bold(?:er)?|lighter)(?=\s|$)/iu);
    const styleMatch = font.match(/(?:^|\s)((?:italic|oblique(?:\s+-?\d+(?:\.\d+)?(?:deg|grad|rad|turn))?))(?=\s|$)/iu);
    return {
      fontStyle: bitmap?.fontItalic ? "italic" : styleMatch?.[1] || "normal",
      fontWeight: bitmap?.fontBold ? "700" : weightMatch?.[1] || "400",
      fontKerning: canvasEnum(context?.fontKerning, ["auto", "normal", "none"], "auto"),
      fontStretch: canvasEnum(
        context?.fontStretch,
        [
          "ultra-condensed",
          "extra-condensed",
          "condensed",
          "semi-condensed",
          "normal",
          "semi-expanded",
          "expanded",
          "extra-expanded",
          "ultra-expanded"
        ],
        "normal"
      ),
      fontVariantCaps: canvasEnum(
        context?.fontVariantCaps,
        [
          "normal",
          "small-caps",
          "all-small-caps",
          "petite-caps",
          "all-petite-caps",
          "unicase",
          "titling-caps"
        ],
        "normal"
      ),
      letterSpacing: canvasLength(context?.letterSpacing, "0px"),
      wordSpacing: canvasLength(context?.wordSpacing, "0px"),
      direction: canvasEnum(context?.direction, ["ltr", "rtl", "inherit"], "inherit")
    };
  }
  function splitFontFamilies(value) {
    const result = [];
    let current = "";
    let quote = "";
    for (const char of String(value)) {
      if ((char === '"' || char === "'") && (!quote || quote === char)) {
        quote = quote ? "" : char;
        current += char;
        continue;
      }
      if (char === "," && !quote) {
        if (current.trim()) result.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    if (current.trim()) result.push(current.trim());
    return result;
  }
  function normalizeFontFamily(value) {
    return String(value || "").trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2").toLocaleLowerCase();
  }
  function canvasEnum(value, allowed, fallback) {
    const normalized = String(value || "").toLocaleLowerCase();
    return allowed.includes(normalized) ? normalized : fallback;
  }
  function canvasLength(value, fallback) {
    const normalized = String(value || "").trim();
    return /^-?\d+(?:\.\d+)?px$/u.test(normalized) ? normalized : fallback;
  }
  function cssTransformFromTopLeftCanvasQuad(points, canvasRect, canvasWidth, canvasHeight, localWidth, localHeight) {
    if (!Array.isArray(points) || points.length !== 4) return null;
    if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) return null;
    const width = Number(localWidth);
    const height = Number(localHeight);
    if (!(width > 0) || !(height > 0)) return null;
    const surfaceWidth = Number(canvasWidth) || canvasRect.width;
    const surfaceHeight = Number(canvasHeight) || canvasRect.height;
    const scaleX = canvasRect.width / surfaceWidth;
    const scaleY = canvasRect.height / surfaceHeight;
    const cssPoints = points.map((point) => ({
      x: canvasRect.left + Number(point?.x) * scaleX,
      y: canvasRect.top + Number(point?.y) * scaleY
    }));
    if (cssPoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      return null;
    }
    const [topLeft, topRight, , bottomLeft] = cssPoints;
    return {
      left: topLeft.x,
      top: topLeft.y,
      width,
      height,
      matrix: {
        a: (topRight.x - topLeft.x) / width,
        b: (topRight.y - topLeft.y) / width,
        c: (bottomLeft.x - topLeft.x) / height,
        d: (bottomLeft.y - topLeft.y) / height
      },
      bounds: {
        left: Math.min(...cssPoints.map((point) => point.x)),
        top: Math.min(...cssPoints.map((point) => point.y)),
        right: Math.max(...cssPoints.map((point) => point.x)),
        bottom: Math.max(...cssPoints.map((point) => point.y))
      }
    };
  }

  // player-runtime/bridge/overlay.ts
  var OWNER_ID = "__mzPlayerTextOverlayOwnerId";
  function createTextOverlayBridge({ config, postParentMessage, settings }) {
    const overlayState = {
      nextOwnerId: 1,
      bitmapOwners: /* @__PURE__ */ new WeakMap(),
      contextOwners: /* @__PURE__ */ new WeakMap(),
      entries: /* @__PURE__ */ new Map(),
      lineGroups: /* @__PURE__ */ new Map(),
      textLogTimers: /* @__PURE__ */ new Map(),
      textLogValues: /* @__PURE__ */ new Map(),
      domSourceIds: /* @__PURE__ */ new WeakMap(),
      consumedGuardKeyCodes: /* @__PURE__ */ new Set(),
      hoveredTextEntry: null,
      raf: 0,
      lastScene: null,
      installedHooks: false,
      rpgMakerRehookScheduled: false,
      inputGuardInstalled: false,
      sceneHooksInstalled: false,
      sceneBaseHooksInstalled: false,
      focusReturnInstalled: false,
      tyranoHooksInstalled: false,
      tyranoObserver: null,
      tyranoScanFrame: 0,
      construct2HooksInstalled: false,
      construct2ScanFrame: 0,
      cocosEngine: null,
      cocosHooksInstalled: false,
      cocosScanFrame: 0,
      cocosLastScanAt: 0,
      nextDomSourceId: 1,
      canvasTextCaptureDepth: 0,
      activeRpgMakerDrawCapture: null,
      baselineProbeCache: /* @__PURE__ */ new Map(),
      measureContext: null,
      root: null,
      style: null
    };
    function ensureOverlayDom() {
      if (!overlayState.style) {
        overlayState.style = document.createElement("style");
        overlayState.style.textContent = `
        canvas:focus,
        canvas:focus-visible,
        video:focus,
        video:focus-visible {
          outline: none !important;
        }

        #mz-player-text-overlay {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          pointer-events: none;
          display: none;
          font-synthesis: none;
          text-rendering: optimizeLegibility;
        }

        #mz-player-text-overlay.mz-player-text-overlay-active {
          display: block;
        }

        .mz-player-text-overlay-entry {
          position: fixed;
          box-sizing: border-box;
          display: block;
          white-space: pre;
          overflow: visible;
          pointer-events: none;
          user-select: text;
          contain: layout style paint;
          color: transparent;
          text-shadow: none;
          background: transparent;
          border-radius: 2px;
          padding: 0;
          margin: 0;
          border: 0;
          line-height: 1;
          letter-spacing: 0;
          word-spacing: 0;
          font-kerning: none;
          font-variant-ligatures: none;
          opacity: 1;
        }

        .mz-player-text-overlay-entry-dom {
          white-space: pre-wrap;
          overflow-wrap: normal;
        }

        .mz-player-text-overlay-entry-construct2 {
          white-space: pre;
          overflow: visible;
        }

        .mz-player-text-overlay-entry-construct2-line {
          position: absolute;
          display: block;
          white-space: pre;
          transform-origin: 0 0;
          user-select: text;
        }

        .mz-player-text-overlay-entry-construct2-character {
          position: absolute;
          display: block;
          top: 0;
          white-space: pre;
          transform-origin: 0 0;
          font: inherit;
          color: inherit;
          text-shadow: inherit;
        }

        .mz-player-text-overlay-entry-cocos {
          white-space: pre-wrap;
          overflow: hidden;
        }

        .mz-player-text-overlay-entry-rpg-text {
          position: absolute;
          display: block;
          box-sizing: border-box;
          white-space: pre;
          overflow: visible;
          padding: 0;
          margin: 0;
          border: 0;
          color: inherit;
          text-shadow: inherit;
          user-select: text;
        }

        .mz-player-text-overlay-entry-rpg {
          contain: layout style;
        }

        .mz-player-text-overlay-entry-rpg-segment {
          position: absolute;
          display: block;
          top: 0;
          white-space: pre;
          font: inherit;
          color: inherit;
          text-shadow: inherit;
        }

        #mz-player-text-overlay.mz-player-text-overlay-readable .mz-player-text-overlay-entry {
          color: rgba(255, 255, 255, 0.96);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.95), 0 0 3px rgba(0, 0, 0, 0.8);
          background: transparent;
        }

        #mz-player-text-overlay.mz-player-text-overlay-reader .mz-player-text-overlay-entry {
          pointer-events: auto;
          cursor: text;
        }
      `;
        document.documentElement.appendChild(overlayState.style);
      }
      if (!overlayState.root) {
        overlayState.root = document.createElement("div");
        overlayState.root.id = "mz-player-text-overlay";
        document.documentElement.appendChild(overlayState.root);
        installOverlayFocusReturn();
      }
    }
    function installOverlayFocusReturn() {
      if (!overlayState.root || overlayState.focusReturnInstalled) return;
      overlayState.focusReturnInstalled = true;
      const trackOverlayText = (event) => {
        const entry = overlayTextEntry(event.target);
        if (!entry) return;
        overlayState.hoveredTextEntry = entry;
      };
      const clearOverlayText = (event) => {
        if (!overlayState.hoveredTextEntry) return;
        if (event.relatedTarget instanceof Node && overlayState.root.contains(event.relatedTarget)) return;
        overlayState.hoveredTextEntry = null;
      };
      const consumeOverlayTextPointerEvent = (event) => {
        const entry = overlayTextEntry(event.target);
        if (!entry) return;
        overlayState.hoveredTextEntry = entry;
        event.stopPropagation();
      };
      const restoreGameFocusAfterSurfacePointer = (event) => {
        if (overlayTextEntry(event.target) || !eventTargetsGameSurface(event.target)) return;
        if (!FOCUS_RETURN_EVENT_TYPES.includes(event.type)) return;
        window.setTimeout(() => {
          focusGameTarget();
          returnFocus();
        }, 0);
      };
      const returnFocus = () => {
        if (!settings.readerMode) return;
        window.setTimeout(() => {
          postParentMessage({ type: "return-focus" });
        }, 0);
      };
      for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "contextmenu", "touchstart", "touchend"]) {
        window.addEventListener(type, consumeOverlayTextPointerEvent, true);
        window.addEventListener(type, restoreGameFocusAfterSurfacePointer, true);
      }
      overlayState.root.addEventListener("pointerover", trackOverlayText, true);
      overlayState.root.addEventListener("pointermove", trackOverlayText, true);
      overlayState.root.addEventListener("pointerdown", trackOverlayText, true);
      overlayState.root.addEventListener("pointerup", returnFocus, true);
      overlayState.root.addEventListener("mouseup", returnFocus, true);
      overlayState.root.addEventListener("touchend", returnFocus, true);
      overlayState.root.addEventListener("click", returnFocus, true);
      overlayState.root.addEventListener("pointerout", clearOverlayText, true);
      for (const type of ["keydown", "keypress", "keyup"]) {
        window.addEventListener(type, handleDictionaryGuardKeyEvent, true);
      }
      window.addEventListener("blur", clearGuardState, true);
      document.addEventListener(
        "visibilitychange",
        () => {
          if (document.visibilityState !== "visible") clearGuardState();
        },
        true
      );
    }
    function overlayTextEntry(target) {
      return target instanceof Element ? target.closest(".mz-player-text-overlay-entry") : null;
    }
    function eventTargetsGameSurface(target) {
      if (target === document || target === document.body || target === document.documentElement) return true;
      return target instanceof Element && Boolean(target.closest("canvas, video"));
    }
    function dictionaryGuardActive() {
      return Boolean(settings.overlayEnabled && settings.dictionaryDismissGuard?.enabled && settings.dictionaryDismissGuard.triggers?.length);
    }
    function handleDictionaryGuardKeyEvent(event) {
      if (event.code === "Escape") {
        clearGuardState();
        return;
      }
      maybeConsumeDictionaryDismissKeyEvent(event);
    }
    function maybeConsumeDictionaryDismissKeyEvent(event) {
      if (event.type === "keyup" && overlayState.consumedGuardKeyCodes.has(event.code)) {
        overlayState.consumedGuardKeyCodes.delete(event.code);
        releaseRpgMakerInputState(event);
        consumeEvent(event);
        return true;
      }
      if (event.type === "keyup" && guardReleaseMatchesKeyEvent(event)) {
        overlayState.consumedGuardKeyCodes.delete(event.code);
        releaseRpgMakerInputState(event);
        consumeEvent(event);
        return true;
      }
      if (!dictionaryGuardActive()) return false;
      const match = settings.dictionaryDismissGuard.triggers.find((trigger) => guardTriggerMatchesKeyEvent(event, trigger));
      if (!match) return false;
      releaseRpgMakerInputState(event);
      consumeEvent(event);
      if (event.type === "keydown") {
        overlayState.consumedGuardKeyCodes.add(event.code);
      }
      if (event.type === "keyup") {
        overlayState.consumedGuardKeyCodes.delete(event.code);
      }
      return true;
    }
    function guardReleaseMatchesKeyEvent(event) {
      if (!settings.dictionaryDismissGuard?.enabled || !settings.dictionaryDismissGuard.triggers?.length) return false;
      return settings.dictionaryDismissGuard.triggers.some((trigger) => {
        if (trigger.code) return event.code === trigger.code;
        return modifierOnlyTriggerMatchesEventCode(event.code, trigger);
      });
    }
    function guardTriggerMatchesKeyEvent(event, trigger) {
      if (!exactModifierMatch(event, trigger)) return false;
      if (trigger.code) return event.code === trigger.code;
      return modifierOnlyTriggerMatchesEventCode(event.code, trigger);
    }
    function modifierOnlyTriggerMatchesEventCode(code, trigger) {
      return trigger.altKey && (code === "AltLeft" || code === "AltRight") || trigger.ctrlKey && (code === "ControlLeft" || code === "ControlRight") || trigger.metaKey && (code === "MetaLeft" || code === "MetaRight") || trigger.shiftKey && (code === "ShiftLeft" || code === "ShiftRight");
    }
    function installDictionaryGuardInputHooks() {
      if (overlayState.inputGuardInstalled) return;
      const install = () => {
        if (overlayState.inputGuardInstalled) return true;
        const input = window.Input;
        if (!input || typeof input._onKeyDown !== "function" || typeof input._onKeyUp !== "function") return false;
        overlayState.inputGuardInstalled = true;
        const originalKeyDown = input._onKeyDown;
        const originalKeyUp = input._onKeyUp;
        input._onKeyDown = function(event) {
          if (dictionaryGuardInputShouldBlock(event)) {
            overlayState.consumedGuardKeyCodes.add(event.code);
            releaseRpgMakerInputState(event);
            consumeEvent(event);
            return;
          }
          return originalKeyDown.apply(this, arguments);
        };
        input._onKeyUp = function(event) {
          if (overlayState.consumedGuardKeyCodes.has(event.code) || dictionaryGuardInputShouldBlock(event)) {
            overlayState.consumedGuardKeyCodes.delete(event.code);
            releaseRpgMakerInputState(event);
            consumeEvent(event);
            return;
          }
          return originalKeyUp.apply(this, arguments);
        };
        return true;
      };
      if (install()) return;
      setTimeout(installDictionaryGuardInputHooks, 250);
    }
    function dictionaryGuardInputShouldBlock(event) {
      if (!dictionaryGuardActive()) return false;
      return settings.dictionaryDismissGuard.triggers.some((trigger) => guardTriggerMatchesKeyEvent(event, trigger));
    }
    function releaseRpgMakerInputState(event) {
      const input = window.Input;
      const keyName = input?.keyMapper?.[event.keyCode];
      if (!keyName || !input._currentState) return;
      input._currentState[keyName] = false;
      if (input._latestButton === keyName) input._latestButton = null;
    }
    function consumeEvent(event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    }
    function clearGuardState() {
      overlayState.consumedGuardKeyCodes.clear();
    }
    function focusGameTarget() {
      const graphics = window.Graphics || {};
      const canvas = graphics._canvas || document.querySelector("canvas");
      const target = canvas || document.body || document.documentElement;
      try {
        window.focus();
      } catch {
      }
      focusElement(document.documentElement);
      focusElement(document.body);
      focusElement(target);
      if (canvas && canvas !== target) focusElement(canvas);
    }
    function focusElement(target) {
      if (!target || typeof target.focus !== "function") return;
      try {
        if (target instanceof HTMLElement && !target.hasAttribute("tabindex")) {
          target.tabIndex = -1;
        }
        if (target instanceof HTMLElement) {
          target.style.outline = "none";
        }
        target.focus({ preventScroll: true });
      } catch {
        try {
          target.focus();
        } catch {
        }
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
    function installRpgMakerOverlayHooks() {
      const install = () => {
        if (!window.Bitmap || !window.Window_Base || !window.Window || !window.Graphics) return false;
        if (overlayState.installedHooks) {
          hookRpgMakerTextMethods();
          return true;
        }
        overlayState.installedHooks = true;
        installSceneHooks();
        installCanvasTextHooks();
        hookRpgMakerTextMethods();
        scheduleRpgMakerTextRehook();
        if (document.fonts) {
          document.fonts.ready.then(refreshRpgMakerFontMetrics);
          document.fonts.addEventListener?.("loadingdone", refreshRpgMakerFontMetrics);
        }
        const bitmapClear = Bitmap.prototype.clear;
        Bitmap.prototype.clear = function() {
          forgetBitmap(this);
          return bitmapClear.apply(this, arguments);
        };
        const bitmapClearRect = Bitmap.prototype.clearRect;
        Bitmap.prototype.clearRect = function(x, y, width, height) {
          forgetBitmapRect(this, x, y, width, height);
          return bitmapClearRect.apply(this, arguments);
        };
        const createContents = Window_Base.prototype.createContents;
        Window_Base.prototype.createContents = function() {
          const previousContents = this.contents;
          const result = createContents.apply(this, arguments);
          if (previousContents && previousContents !== this.contents) {
            forgetBitmap(previousContents);
          }
          if (this.contents) trackBitmapOwner(this.contents, this);
          return result;
        };
        const windowMove = Window.prototype.move;
        Window.prototype.move = function() {
          const result = windowMove.apply(this, arguments);
          scheduleFlush();
          return result;
        };
        const windowUpdateTransform = Window.prototype.updateTransform;
        Window.prototype.updateTransform = function() {
          const result = windowUpdateTransform.apply(this, arguments);
          if (overlayIsActive()) scheduleFlush();
          return result;
        };
        const windowDestroy = Window.prototype.destroy;
        if (typeof windowDestroy === "function") {
          Window.prototype.destroy = function() {
            forgetOwner(this);
            const result = windowDestroy.apply(this, arguments);
            scheduleFlush();
            return result;
          };
        }
        return true;
      };
      if (install()) return;
      setTimeout(installRpgMakerOverlayHooks, 250);
    }
    function hookRpgMakerTextMethods() {
      const bitmapDrawText = window.Bitmap?.prototype?.drawText;
      if (typeof bitmapDrawText === "function" && !bitmapDrawText.__mzPlayerTextOverlayHook) {
        const hookedBitmapDrawText = function(text, x, y, maxWidth, lineHeight, align) {
          const previousCapture = overlayState.activeRpgMakerDrawCapture;
          const drawCapture = { bitmap: this, calls: [] };
          overlayState.activeRpgMakerDrawCapture = drawCapture;
          overlayState.canvasTextCaptureDepth++;
          try {
            const result = bitmapDrawText.apply(this, arguments);
            if (!drawCapture.innerCaptured) {
              captureBitmapText(
                this,
                text,
                x,
                y,
                maxWidth,
                lineHeight,
                align,
                preferredRpgMakerDrawCall(drawCapture.calls, text)
              );
            }
            return result;
          } finally {
            overlayState.canvasTextCaptureDepth--;
            overlayState.activeRpgMakerDrawCapture = previousCapture;
            if (previousCapture) {
              previousCapture.calls.push(...drawCapture.calls);
              previousCapture.innerCaptured = true;
            }
          }
        };
        Object.defineProperty(hookedBitmapDrawText, "__mzPlayerTextOverlayHook", { value: true });
        Bitmap.prototype.drawText = hookedBitmapDrawText;
      }
      const drawTextEx = window.Window_Base?.prototype?.drawTextEx;
      if (typeof drawTextEx === "function" && !drawTextEx.__mzPlayerTextOverlayHook) {
        const hookedDrawTextEx = function() {
          if (this.contents) trackBitmapOwner(this.contents, this);
          return drawTextEx.apply(this, arguments);
        };
        Object.defineProperty(hookedDrawTextEx, "__mzPlayerTextOverlayHook", { value: true });
        Window_Base.prototype.drawTextEx = hookedDrawTextEx;
      }
    }
    function scheduleRpgMakerTextRehook() {
      if (overlayState.rpgMakerRehookScheduled) return;
      overlayState.rpgMakerRehookScheduled = true;
      const rehook = () => {
        hookRpgMakerTextMethods();
        scheduleFlush();
      };
      window.addEventListener("load", rehook, { once: true });
      window.setTimeout(rehook, 750);
      window.setTimeout(rehook, 2500);
    }
    function installTyranoOverlayHooks() {
      if (overlayState.tyranoHooksInstalled) return;
      const install = () => {
        if (overlayState.tyranoHooksInstalled) return true;
        const roots = tyranoRoots();
        if (!roots.length) return false;
        overlayState.tyranoHooksInstalled = true;
        overlayState.tyranoObserver = new MutationObserver(scheduleTyranoScan);
        for (const root of roots) {
          overlayState.tyranoObserver.observe(root, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["class", "hidden", "style"]
          });
        }
        if (document.fonts) {
          document.fonts.ready.then(scheduleTyranoScan);
          document.fonts.addEventListener?.("loadingdone", scheduleTyranoScan);
        }
        window.addEventListener("resize", scheduleTyranoScan);
        scheduleTyranoScan();
        return true;
      };
      if (install()) return;
      setTimeout(installTyranoOverlayHooks, 250);
    }
    function installConstruct2OverlayHooks() {
      if (overlayState.construct2HooksInstalled) return;
      overlayState.construct2HooksInstalled = true;
      const scan = () => {
        overlayState.construct2ScanFrame = 0;
        scanConstruct2Text();
        overlayState.construct2ScanFrame = requestAnimationFrame(scan);
      };
      overlayState.construct2ScanFrame = requestAnimationFrame(scan);
    }
    function installCocosOverlayHooks() {
      if (overlayState.cocosHooksInstalled) return;
      const install = () => {
        if (overlayState.cocosHooksInstalled) return true;
        ensureOverlayDom();
        const engine = resolveCocosEngine(window.System);
        if (!engine) return false;
        overlayState.cocosEngine = engine;
        overlayState.cocosHooksInstalled = true;
        if (document.fonts) {
          document.fonts.ready.then(scheduleFlush);
          document.fonts.addEventListener?.("loadingdone", scheduleFlush);
        }
        const scan = (now) => {
          overlayState.cocosScanFrame = 0;
          if (now - overlayState.cocosLastScanAt >= 50) {
            overlayState.cocosLastScanAt = now;
            scanCocosText();
          }
          overlayState.cocosScanFrame = requestAnimationFrame(scan);
        };
        overlayState.cocosScanFrame = requestAnimationFrame(scan);
        return true;
      };
      if (install()) return;
      setTimeout(installCocosOverlayHooks, 250);
    }
    function scanCocosText() {
      if (!overlayIsActive()) return;
      const engine = overlayState.cocosEngine;
      const scene = engine?.director?.getScene?.();
      const canvas = cocosCanvas(engine);
      if (!scene || !(canvas instanceof HTMLCanvasElement)) return;
      const seen = /* @__PURE__ */ new Set();
      const visit = (node, insideRichText = false) => {
        if (!node || node.activeInHierarchy === false || node.active === false) return;
        const components = Array.isArray(node._components) ? node._components : [];
        const richText = components.find((component) => cocosComponentIs(component, engine.RichText));
        if (richText && cocosSourceIsVisible(richText)) {
          captureCocosSource(engine, richText, canvas, true, seen);
        }
        if (!insideRichText && !richText) {
          for (const component of components) {
            if (cocosComponentIs(component, engine.Label) && cocosSourceIsVisible(component)) {
              captureCocosSource(engine, component, canvas, false, seen);
            }
          }
        }
        for (const child of node.children || []) visit(child, insideRichText || Boolean(richText));
      };
      visit(scene);
      for (const [key, entry] of overlayState.entries) {
        if (entry.cocosSource && !seen.has(key)) removeEntry(key, entry);
      }
      scheduleFlush();
    }
    function cocosComponentIs(component, Component) {
      if (!component || typeof Component !== "function") return false;
      try {
        return component instanceof Component;
      } catch {
        return false;
      }
    }
    function captureCocosSource(engine, source, canvas, richText, seen) {
      const rawText = source.string ?? source._string;
      const text = richText ? plainCocosText(rawText) : String(rawText ?? "").replace(/\u00a0/gu, " ").trim();
      if (!text) return;
      const displayText = cocosRenderedText(source, text);
      const rect = cocosPageRect(engine, source, canvas, displayText);
      if (!rect) return;
      const key = `cocos:${domSourceId(source)}`;
      seen.add(key);
      upsertEntry(key, {
        cocosSource: source,
        cocosRect: rect,
        text,
        displayText,
        width: rect.width,
        height: rect.height,
        fontSize: rect.fontSize,
        fontFace: cocosCssFontFamily(source),
        fontStyle: source.isItalic || source._isItalic ? "italic" : "normal",
        fontWeight: source.isBold || source._isBold ? "700" : "400",
        textDecoration: source.isUnderline || source._isUnderline ? "underline" : "none",
        lineHeight: rect.lineHeight,
        paddingTop: rect.paddingTop,
        textAlign: cocosTextAlign(source.horizontalAlign ?? source._horizontalAlign),
        updatedAt: performance.now()
      });
    }
    function cocosCanvas(engine) {
      return engine?.game?.canvas || document.querySelector("#GameCanvas, canvas");
    }
    function cocosSourceIsVisible(source) {
      const node = source?.node;
      if (!node || node.isValid === false || node.activeInHierarchy === false) return false;
      if (source.enabled === false || source.enabledInHierarchy === false) return false;
      const colorAlpha = Number(source.color?.a ?? source._color?.a ?? 255);
      if (colorAlpha <= 0) return false;
      let current = node;
      let guard = 0;
      while (current && guard++ < 100) {
        if (current.active === false || current.activeInHierarchy === false) return false;
        current = current.parent;
      }
      return true;
    }
    function cocosPageRect(engine, source, canvas, text) {
      const node = source.node;
      const transform = node?.getComponent?.(engine.UITransform);
      const camera = engine?.director?.root?.batcher2D?.getFirstRenderCamera?.(node);
      const Vec3 = engine?.Vec3;
      if (!transform || !camera || typeof Vec3 !== "function") return null;
      const contentSize = transform.contentSize || transform._contentSize;
      const anchor = transform.anchorPoint || transform._anchorPoint;
      const width = Number(contentSize?.width);
      const height = Number(contentSize?.height);
      const anchorX = Number(anchor?.x);
      const anchorY = Number(anchor?.y);
      if (!(width > 0) || !(height > 0)) return null;
      const localPoints = [
        [-width * (Number.isFinite(anchorX) ? anchorX : 0.5), -height * (Number.isFinite(anchorY) ? anchorY : 0.5)],
        [width * (1 - (Number.isFinite(anchorX) ? anchorX : 0.5)), -height * (Number.isFinite(anchorY) ? anchorY : 0.5)],
        [width * (1 - (Number.isFinite(anchorX) ? anchorX : 0.5)), height * (1 - (Number.isFinite(anchorY) ? anchorY : 0.5))],
        [-width * (Number.isFinite(anchorX) ? anchorX : 0.5), height * (1 - (Number.isFinite(anchorY) ? anchorY : 0.5))]
      ];
      const screenPoints = [];
      try {
        for (const [x, y] of localPoints) {
          const world = transform.convertToWorldSpaceAR(new Vec3(x, y, 0), new Vec3());
          const screen = cocosWorldToScreen(camera, Vec3, world);
          if (!screen) return null;
          screenPoints.push({ x: Number(screen.x), y: Number(screen.y) });
        }
      } catch {
        return null;
      }
      const canvasRect = canvas.getBoundingClientRect();
      const rect = cocosCssRectFromScreenPoints(screenPoints, canvasRect, canvas.width, canvas.height);
      const geometry = cocosCssTransformFromScreenPoints(
        screenPoints,
        canvasRect,
        canvas.width,
        canvas.height,
        width,
        height
      );
      if (!rect || !geometry || geometry.bounds.left >= canvasRect.right || geometry.bounds.top >= canvasRect.bottom || geometry.bounds.right <= canvasRect.left || geometry.bounds.bottom <= canvasRect.top) {
        return null;
      }
      const { fontSize, lineHeight } = cocosFontMetrics(
        source,
        engine?.view?.getScaleX?.() || 1
      );
      const lineCount = Math.max(1, String(text).split("\n").length);
      const textHeight = Math.min(height, lineHeight * lineCount);
      const verticalFactor = cocosVerticalAlignFactor(source.verticalAlign ?? source._verticalAlign);
      return {
        left: roundCocosCssNumber(geometry.left),
        top: roundCocosCssNumber(geometry.top),
        width: roundCocosCssNumber(geometry.width),
        height: roundCocosCssNumber(geometry.height),
        fontSize: roundCocosCssNumber(fontSize),
        lineHeight: roundCocosCssNumber(lineHeight),
        paddingTop: roundCocosCssNumber(Math.max(0, height - textHeight) * verticalFactor),
        transform: `matrix(${roundCocosCssNumber(geometry.matrix.a)}, ${roundCocosCssNumber(geometry.matrix.b)}, ${roundCocosCssNumber(geometry.matrix.c)}, ${roundCocosCssNumber(geometry.matrix.d)}, 0, 0)`
      };
    }
    function roundCocosCssNumber(value) {
      return Math.round(value * 1e3) / 1e3;
    }
    function scanConstruct2Text() {
      if (!overlayIsActive()) return;
      const runtime = construct2Runtime();
      if (!runtime || !Array.isArray(runtime.types_by_index)) return;
      const seen = /* @__PURE__ */ new Set();
      for (const type of runtime.types_by_index) {
        if (!isConstruct2TextType(type) || !Array.isArray(type.instances)) continue;
        for (const source of type.instances) {
          if (!construct2SourceIsVisible(source)) continue;
          const text = construct2SourceText(source);
          if (!text) continue;
          const rect = construct2PageRect(runtime, source);
          if (!rect) continue;
          const key = `construct2:${domSourceId(source)}`;
          seen.add(key);
          upsertEntry(key, {
            constructSource: source,
            constructRect: rect,
            text,
            width: rect.width,
            height: rect.height,
            fontSize: rect.fontSize,
            fontFace: fontFamilyWithEmojiFallback(source.facename || "sans-serif"),
            fontStyle: /italic/iu.test(String(source.fontstyle || "")) ? "italic" : "normal",
            fontWeight: /bold/iu.test(String(source.fontstyle || "")) ? "700" : "400",
            lineHeight: rect.lineHeight,
            paddingTop: rect.paddingTop,
            textAlign: construct2TextAlign(source.halign),
            updatedAt: performance.now()
          });
        }
      }
      for (const [key, entry] of overlayState.entries) {
        if (entry.constructSource && !seen.has(key)) removeEntry(key, entry);
      }
    }
    function construct2Runtime() {
      try {
        return window.cr_getC2Runtime?.() || window.c2runtime || null;
      } catch {
        return window.c2runtime || null;
      }
    }
    function isConstruct2TextType(type) {
      const plugins = window.cr?.plugins_;
      const plugin = type?.plugin;
      if (!plugins || !plugin) return false;
      return [plugins.Text, plugins.Spritefont2].some(
        (Plugin) => typeof Plugin === "function" && plugin instanceof Plugin
      );
    }
    function construct2SourceText(source) {
      try {
        source.rebuildText?.();
      } catch {
      }
      if (Array.isArray(source.lines) && source.lines.length > 0) {
        const lines = source.lines.map((line) => String(line?.text ?? ""));
        if (lines.some(Boolean)) return lines.join("\n");
      }
      return String(source.text ?? "");
    }
    function construct2SourceIsVisible(source) {
      if (!source || source.visible === false || Number(source.opacity) === 0) return false;
      const layer = source.layer;
      if (!layer || layer.visible === false || Number(layer.opacity) === 0) return false;
      return true;
    }
    function construct2PageRect(runtime, source) {
      const canvas = runtime.canvas || document.querySelector("#c2canvas");
      const layer = source.layer;
      if (!(canvas instanceof HTMLCanvasElement) || !layer) return null;
      try {
        source.update_bbox?.();
      } catch {
        return null;
      }
      const quad = source.bquad;
      if (!quad) return null;
      const points = [
        [quad.tlx, quad.tly],
        [quad.trx, quad.try_],
        [quad.brx, quad.bry],
        [quad.blx, quad.bly]
      ].map(([x, y]) => ({
        x: Number(layer.layerToCanvas?.(x, y, true, true)),
        y: Number(layer.layerToCanvas?.(x, y, false, true))
      }));
      if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
      const canvasRect = canvas.getBoundingClientRect();
      if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;
      const sourceWidth = Math.abs(Number(source.width));
      const sourceHeight = Math.abs(Number(source.height));
      const geometry = cssTransformFromTopLeftCanvasQuad(
        points,
        canvasRect,
        runtime.draw_width || canvas.width,
        runtime.draw_height || canvas.height,
        sourceWidth,
        sourceHeight
      );
      if (!geometry || geometry.bounds.left >= canvasRect.right || geometry.bounds.top >= canvasRect.bottom || geometry.bounds.right <= canvasRect.left || geometry.bounds.bottom <= canvasRect.top) {
        return null;
      }
      const sourceFontSize = Number(source.characterHeight) * (Number(source.characterScale) || 1) || Number(source.pxHeight) || 24;
      const lineHeight = sourceFontSize + (Number(source.lineHeight) || Number(source.line_height_offset) || 0);
      const textHeight = Math.max(
        lineHeight,
        Number(source.textHeight) || lineHeight * Math.max(1, source.lines?.length || 1)
      );
      return {
        left: roundCocosCssNumber(geometry.left),
        top: roundCocosCssNumber(geometry.top),
        width: roundCocosCssNumber(geometry.width),
        height: roundCocosCssNumber(geometry.height),
        fontSize: roundCocosCssNumber(sourceFontSize),
        lineHeight: roundCocosCssNumber(Math.max(1, lineHeight)),
        paddingTop: roundCocosCssNumber(
          (Number(source.valign) || 0) * Math.max(0, sourceHeight - textHeight)
        ),
        transform: `matrix(${roundCocosCssNumber(geometry.matrix.a)}, ${roundCocosCssNumber(geometry.matrix.b)}, ${roundCocosCssNumber(geometry.matrix.c)}, ${roundCocosCssNumber(geometry.matrix.d)}, 0, 0)`
      };
    }
    function construct2TextAlign(halign) {
      const value = Number(halign);
      if (value >= 0.75) return "right";
      if (value >= 0.25) return "center";
      return "left";
    }
    function scheduleTyranoScan() {
      if (!overlayState.tyranoHooksInstalled || overlayState.tyranoScanFrame) return;
      overlayState.tyranoScanFrame = requestAnimationFrame(() => {
        overlayState.tyranoScanFrame = 0;
        scanTyranoText();
      });
    }
    function scanTyranoText() {
      if (!overlayIsActive()) return;
      const roots = tyranoRoots();
      if (!roots.length) return;
      const sources = /* @__PURE__ */ new Set();
      for (const root of roots) {
        for (const message of root.querySelectorAll(".message_inner")) {
          const paragraphs = message.querySelectorAll(":scope > p");
          if (!paragraphs.length) {
            sources.add(message);
            continue;
          }
          for (const paragraph of paragraphs) {
            const styledSpans = paragraph.querySelectorAll(":scope > span");
            if (styledSpans.length) {
              for (const span of styledSpans) sources.add(span);
            } else {
              sources.add(paragraph);
            }
          }
        }
        for (const source of root.querySelectorAll(".chara_name_area, [data-event-tag='glink'], .vchat-text-inner")) {
          sources.add(source);
        }
      }
      const activeKeys = /* @__PURE__ */ new Set();
      for (const source of sources) {
        const text = tyranoSourceText(source);
        if (!text || !domSourceIsVisible(source)) continue;
        const key = `tyrano:${domSourceId(source)}`;
        const style = getComputedStyle(source);
        const scale = domVisualScale(source);
        activeKeys.add(key);
        upsertEntry(key, {
          domSource: source,
          text,
          fontSize: parseCssNumber(style.fontSize) || 24,
          fontFace: fontFamilyWithEmojiFallback(style.fontFamily || "sans-serif"),
          fontStyle: style.fontStyle,
          fontWeight: style.fontWeight,
          fontStretch: style.fontStretch,
          fontVariant: style.fontVariant,
          fontKerning: style.fontKerning,
          fontOpticalSizing: style.fontOpticalSizing,
          fontFeatureSettings: style.fontFeatureSettings,
          fontVariationSettings: style.fontVariationSettings,
          fontSynthesis: style.fontSynthesis,
          lineHeightCss: style.lineHeight || "normal",
          textAlign: style.textAlign || "left",
          textAlignLast: style.textAlignLast,
          direction: style.direction,
          letterSpacing: style.letterSpacing,
          wordSpacing: style.wordSpacing,
          wordBreak: style.wordBreak,
          overflowWrap: style.overflowWrap,
          whiteSpace: style.whiteSpace,
          writingMode: style.writingMode,
          textOrientation: style.textOrientation,
          textRendering: style.textRendering,
          textTransform: style.textTransform,
          textIndent: style.textIndent,
          textDecorationLine: style.textDecorationLine,
          textDecorationStyle: style.textDecorationStyle,
          textDecorationThickness: style.textDecorationThickness,
          paddingTop: style.paddingTop,
          paddingRight: style.paddingRight,
          paddingBottom: style.paddingBottom,
          paddingLeft: style.paddingLeft,
          borderTopWidth: style.borderTopWidth,
          borderRightWidth: style.borderRightWidth,
          borderBottomWidth: style.borderBottomWidth,
          borderLeftWidth: style.borderLeftWidth,
          visualScaleX: scale.x,
          visualScaleY: scale.y,
          updatedAt: performance.now()
        });
      }
      for (const [key, entry] of overlayState.entries) {
        if (entry.domSource && !activeKeys.has(key)) removeEntry(key, entry);
      }
      scheduleFlush();
    }
    function tyranoRoots() {
      return Array.from(document.querySelectorAll("#tyrano_base, #vchat_base"));
    }
    function domSourceId(source) {
      let id = overlayState.domSourceIds.get(source);
      if (!id) {
        id = overlayState.nextDomSourceId++;
        overlayState.domSourceIds.set(source, id);
      }
      return id;
    }
    function tyranoSourceText(source) {
      const text = typeof source.innerText === "string" ? source.innerText : source.textContent;
      return String(text || "").replace(/\u00a0/g, " ").trim();
    }
    function parseCssNumber(value) {
      const parsed = Number.parseFloat(String(value || ""));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    function domVisualScale(source) {
      const root = source.closest("#tyrano_base, #vchat_base");
      if (!root) return { x: 1, y: 1 };
      const rect = root.getBoundingClientRect();
      const style = getComputedStyle(root);
      const layoutWidth = parseCssNumber(style.width) || root.offsetWidth;
      const layoutHeight = parseCssNumber(style.height) || root.offsetHeight;
      return {
        x: positiveScale(rect.width, layoutWidth),
        y: positiveScale(rect.height, layoutHeight)
      };
    }
    function positiveScale(rendered, layout) {
      const scale = Number(rendered) / Number(layout);
      return Number.isFinite(scale) && scale > 0 ? scale : 1;
    }
    function scaledCssLength(value, scale) {
      const text = String(value || "");
      const match = text.match(/^(-?\d+(?:\.\d+)?)px$/);
      return match ? `${Number(match[1]) * scale}px` : text || "normal";
    }
    function domSourceIsVisible(source) {
      if (!source?.isConnected) return false;
      const style = getComputedStyle(source);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = source.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
    function installCanvasTextHooks() {
      const canvasContext = window.CanvasRenderingContext2D;
      const prototype = canvasContext && canvasContext.prototype;
      if (!prototype || prototype.__mzPlayerTextOverlayCanvasHooks) return;
      Object.defineProperty(prototype, "__mzPlayerTextOverlayCanvasHooks", {
        value: true,
        configurable: true
      });
      const fillText = prototype.fillText;
      if (typeof fillText === "function") {
        prototype.fillText = function(text, x, y, maxWidth) {
          recordRpgMakerDrawCall(this, "fill", text, x, y, maxWidth);
          const result = fillText.apply(this, arguments);
          captureCanvasText(this, text, x, y, maxWidth);
          return result;
        };
      }
      const strokeText = prototype.strokeText;
      if (typeof strokeText === "function") {
        prototype.strokeText = function(text, x, y, maxWidth) {
          recordRpgMakerDrawCall(this, "stroke", text, x, y, maxWidth);
          const result = strokeText.apply(this, arguments);
          captureCanvasText(this, text, x, y, maxWidth);
          return result;
        };
      }
    }
    function recordRpgMakerDrawCall(context, kind, rawText, x, y, maxWidth) {
      const capture = overlayState.activeRpgMakerDrawCapture;
      const binding = overlayState.contextOwners.get(context);
      if (!capture || !binding || binding.bitmap !== capture.bitmap) return;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      let metrics;
      try {
        metrics = context.measureText(String(rawText ?? ""));
      } catch {
        metrics = null;
      }
      capture.calls.push({
        kind,
        text: String(rawText ?? ""),
        x: Number(x),
        y: Number(y),
        maxWidth: Number(maxWidth),
        font: String(context.font || ""),
        textAlign: String(context.textAlign || "left"),
        textBaseline: String(context.textBaseline || "alphabetic"),
        fontKerning: context.fontKerning,
        fontStretch: context.fontStretch,
        fontVariantCaps: context.fontVariantCaps,
        letterSpacing: context.letterSpacing,
        wordSpacing: context.wordSpacing,
        direction: context.direction,
        measuredWidth: Number(metrics?.width) || 0,
        actualBoundingBoxAscent: Number(metrics?.actualBoundingBoxAscent),
        actualBoundingBoxDescent: Number(metrics?.actualBoundingBoxDescent)
      });
    }
    function preferredRpgMakerDrawCall(calls, rawText) {
      const text = String(rawText ?? "");
      const matching = calls.filter((call) => call.text === text);
      return matching.findLast?.((call) => call.kind === "fill") || [...matching].reverse().find((call) => call.kind === "fill") || matching[matching.length - 1] || null;
    }
    function trackBitmapOwner(bitmap, owner) {
      if (!bitmap || !owner) return;
      overlayState.bitmapOwners.set(bitmap, owner);
      const context = bitmap._context;
      if (context) overlayState.contextOwners.set(context, { bitmap, owner });
    }
    function installSceneHooks() {
      installSceneManagerHooks();
      installSceneBaseHooks();
    }
    function installSceneManagerHooks() {
      if (overlayState.sceneHooksInstalled) return;
      const sceneManager = window.SceneManager;
      if (!sceneManager) {
        setTimeout(installSceneHooks, 250);
        return;
      }
      overlayState.sceneHooksInstalled = true;
      overlayState.lastScene = sceneManager._scene || null;
      const changeScene = sceneManager.changeScene;
      if (typeof changeScene === "function") {
        sceneManager.changeScene = function() {
          const result = changeScene.apply(this, arguments);
          handleSceneMaybeChanged(this._scene || null);
          return result;
        };
      }
      const updateScene = sceneManager.updateScene;
      if (typeof updateScene === "function") {
        sceneManager.updateScene = function() {
          const result = updateScene.apply(this, arguments);
          handleSceneMaybeChanged(this._scene || null);
          return result;
        };
      }
    }
    function installSceneBaseHooks() {
      if (overlayState.sceneBaseHooksInstalled) return;
      const sceneBase = window.Scene_Base;
      const terminate = sceneBase?.prototype?.terminate;
      if (typeof terminate !== "function") {
        setTimeout(installSceneBaseHooks, 250);
        return;
      }
      overlayState.sceneBaseHooksInstalled = true;
      sceneBase.prototype.terminate = function() {
        forgetScene(this);
        const result = terminate.apply(this, arguments);
        scheduleFlush();
        return result;
      };
    }
    function handleSceneMaybeChanged(scene) {
      if (scene === overlayState.lastScene) return;
      overlayState.lastScene = scene || null;
      pruneInvisibleEntries();
      scheduleFlush();
    }
    function pruneInvisibleEntries() {
      for (const [key, entry] of overlayState.entries) {
        if (!entryIsVisible(entry)) removeEntry(key, entry);
      }
    }
    function ownerId(owner) {
      if (!owner[OWNER_ID]) owner[OWNER_ID] = overlayState.nextOwnerId++;
      return owner[OWNER_ID];
    }
    function forgetBitmap(bitmap) {
      if (!overlayState.bitmapOwners.get(bitmap)) return;
      for (const [key, entry] of overlayState.entries) {
        if (entry.bitmap === bitmap) removeEntry(key, entry);
      }
      for (const [key, group] of overlayState.lineGroups) {
        if (group.bitmap === bitmap) overlayState.lineGroups.delete(key);
      }
    }
    function forgetBitmapRect(bitmap, x, y, width, height) {
      const owner = overlayState.bitmapOwners.get(bitmap);
      if (!owner) return;
      const clearRect = {
        x: Number(x) || 0,
        y: Number(y) || 0,
        width: Number(width) || 0,
        height: Number(height) || 0
      };
      if (clearRect.width >= bitmap.width * 0.9 && clearRect.height >= bitmap.height * 0.9) {
        forgetBitmap(bitmap);
        return;
      }
      for (const [key, entry] of overlayState.entries) {
        if (entry.bitmap === bitmap && rectsIntersect(clearRect, entry)) removeEntry(key, entry);
      }
      for (const [key, group] of overlayState.lineGroups) {
        if (group.bitmap === bitmap && rectsIntersect(clearRect, group)) {
          const entry = overlayState.entries.get(group.entryKey);
          if (entry) removeEntry(group.entryKey, entry);
          overlayState.lineGroups.delete(key);
        }
      }
    }
    function forgetScene(scene) {
      for (const [key, entry] of overlayState.entries) {
        if (ownerBelongsToScene(entry.owner, scene)) removeEntry(key, entry);
      }
      for (const [key, group] of overlayState.lineGroups) {
        if (ownerBelongsToScene(group.owner, scene)) overlayState.lineGroups.delete(key);
      }
    }
    function forgetOwner(owner) {
      for (const [key, entry] of overlayState.entries) {
        if (entry.owner === owner) removeEntry(key, entry);
      }
      for (const [key, group] of overlayState.lineGroups) {
        if (group.owner === owner) overlayState.lineGroups.delete(key);
      }
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
    function captureBitmapText(bitmap, rawText, x, y, maxWidth, lineHeight, align, drawCall) {
      const owner = overlayState.bitmapOwners.get(bitmap);
      if (!owner || rawText === void 0 || rawText === null) return;
      trackBitmapOwner(bitmap, owner);
      const text = String(rawText);
      if (!text) return;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const height = Number(lineHeight) || owner.lineHeight?.() || bitmap.fontSize || 24;
      const widthLimit = Number(maxWidth) || 4294967295;
      if (y < -height || y >= bitmap.height || x > bitmap.width || x + widthLimit < 0) return;
      if (owner._checkWordWrapMode) return;
      const fontSize = canvasFontSize(drawCall, bitmap, owner);
      const fontTraits = canvasFontTraits(drawCall, bitmap);
      const measuredWidth = Math.max(1, drawCall?.measuredWidth || safeMeasure(bitmap, text));
      const adjustedX = adjustedTextLeft(x, widthLimit, measuredWidth, align);
      const normalizedY = Math.round(y);
      const alignmentBox = alignmentTextBox(x, widthLimit, measuredWidth, align);
      const baseline = rpgMakerCanvasBaseline(drawCall, normalizedY, height, fontSize);
      const choice = rpgMakerChoiceInfo(owner, bitmap, adjustedX, normalizedY, measuredWidth, height);
      if (text.length === 1) {
        captureLineCharacter(
          owner,
          bitmap,
          text,
          adjustedX,
          normalizedY,
          measuredWidth,
          height,
          baseline,
          fontSize,
          fontTraits,
          choice,
          drawCall
        );
        return;
      }
      const key = [
        ownerId(owner),
        Math.round(alignmentBox.x),
        normalizedY,
        Math.round(alignmentBox.width),
        Math.round(height),
        alignmentBox.textAlign,
        choice?.index ?? "",
        hashText(text)
      ].join(":");
      upsertEntry(key, {
        owner,
        bitmap,
        text,
        x: alignmentBox.x,
        y: normalizedY,
        width: alignmentBox.width,
        height,
        baseline,
        fontSize,
        fontFace: fontFamilyWithEmojiFallback(
          canvasFontFace(drawCall) || bitmap.fontFace || owner.standardFontFace?.() || "sans-serif"
        ),
        ...fontTraits,
        textAlign: alignmentBox.textAlign,
        choiceIndex: choice?.index,
        choiceSprite: choice?.sprite,
        choiceLocalRect: choice?.rect,
        updatedAt: performance.now()
      });
    }
    function captureCanvasText(context, rawText, x, y, maxWidth) {
      if (overlayState.canvasTextCaptureDepth > 0) return;
      const binding = overlayState.contextOwners.get(context);
      if (!binding?.owner || rawText === void 0 || rawText === null) return;
      const text = String(rawText);
      if (!text) return;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const bitmap = binding.bitmap;
      const owner = binding.owner;
      const fontSize = canvasFontSize(context, bitmap, owner);
      const height = Math.max(1, owner.lineHeight?.() || Math.ceil(fontSize * 1.25));
      const measuredWidth = safeMeasureCanvas(context, bitmap, text);
      const width = Math.max(1, Math.min(measuredWidth, Number(maxWidth) || measuredWidth));
      const left = canvasTextLeft(x, width, context.textAlign);
      const top = canvasTextTop(y, fontSize, height, context.textBaseline);
      if (top < -height || top >= bitmap.height || left > bitmap.width || left + width < 0) return;
      if (owner._checkWordWrapMode) return;
      const key = [
        ownerId(owner),
        "canvas",
        Math.round(left),
        Math.round(top),
        Math.round(width),
        Math.round(height),
        hashText(text)
      ].join(":");
      const fontTraits = canvasFontTraits(context, bitmap);
      upsertEntry(key, {
        owner,
        bitmap,
        text,
        x: left,
        y: top,
        width,
        height,
        fontSize,
        fontFace: fontFamilyWithEmojiFallback(
          canvasFontFace(context) || bitmap.fontFace || owner.standardFontFace?.() || "sans-serif"
        ),
        ...fontTraits,
        textAlign: "left",
        updatedAt: performance.now()
      });
    }
    function captureLineCharacter(owner, bitmap, text, x, y, measuredWidth, height, baseline, fontSize, fontTraits, choice, drawCall) {
      const ownerKey = ownerId(owner);
      const key = `${ownerKey}:line:${Math.round(y)}:${Math.round(height)}:${fontSize}:${drawCall?.font || bitmap.fontFace || ""}:${choice?.index ?? ""}`;
      const now = performance.now();
      let group = overlayState.lineGroups.get(key);
      if (!group || x < group.lastX - Math.max(8, height * 0.35) || now - group.updatedAt > 5e3) {
        group = {
          owner,
          bitmap,
          text: "",
          characterSegments: [],
          x,
          y,
          width: 0,
          height,
          baseline,
          fontSize,
          fontFace: fontFamilyWithEmojiFallback(
            canvasFontFace(drawCall) || bitmap.fontFace || owner.standardFontFace?.() || "sans-serif"
          ),
          ...fontTraits,
          choiceIndex: choice?.index,
          choiceSprite: choice?.sprite,
          choiceLocalRect: choice?.rect,
          lastX: x,
          updatedAt: now,
          entryKey: key
        };
        overlayState.lineGroups.set(key, group);
      }
      group.text += text;
      group.characterSegments.push({ text, x, width: measuredWidth });
      group.x = Math.min(group.x, x);
      group.width = Math.max(group.width, x + measuredWidth - group.x);
      group.lastX = x + measuredWidth;
      group.updatedAt = now;
      upsertEntry(group.entryKey, {
        owner: group.owner,
        bitmap: group.bitmap,
        text: group.text,
        x: group.x,
        y: group.y,
        width: Math.max(group.width, 1),
        height: group.height,
        baseline: group.baseline,
        fontSize: group.fontSize,
        fontFace: group.fontFace,
        fontStyle: group.fontStyle,
        fontWeight: group.fontWeight,
        fontKerning: group.fontKerning,
        fontStretch: group.fontStretch,
        fontVariantCaps: group.fontVariantCaps,
        letterSpacing: group.letterSpacing,
        wordSpacing: group.wordSpacing,
        direction: group.direction,
        characterSegments: group.characterSegments,
        choiceIndex: group.choiceIndex,
        choiceSprite: group.choiceSprite,
        choiceLocalRect: group.choiceLocalRect,
        updatedAt: group.updatedAt
      });
    }
    function safeMeasure(bitmap, text) {
      try {
        return Math.max(1, bitmap.measureTextWidth(text));
      } catch {
        return Math.max(1, text.length * (bitmap.fontSize || 24) * 0.6);
      }
    }
    function safeMeasureCanvas(context, bitmap, text) {
      try {
        return Math.max(1, context.measureText(text).width);
      } catch {
        return Math.max(1, text.length * (canvasFontSize(context, bitmap, null) || 24) * 0.6);
      }
    }
    function canvasFontSize(context, bitmap, owner) {
      const match = String(context.font || "").match(/(\d+(?:\.\d+)?)px/);
      const parsed = match ? Number(match[1]) : 0;
      return parsed || bitmap?.fontSize || owner?.standardFontSize?.() || 24;
    }
    function canvasFontFace(context) {
      const font = String(context.font || "").trim();
      if (!font) return "";
      const match = font.match(/\d+(?:\.\d+)?px(?:\/[^\s]+)?\s+(.+)$/);
      return match ? match[1] : "";
    }
    function rpgMakerCanvasBaseline(drawCall, y, lineHeight, fontSize) {
      if (!Number.isFinite(drawCall?.y)) {
        return y + lineHeight / 2 + fontSize * 0.35;
      }
      const baseline = String(drawCall.textBaseline || "alphabetic");
      if (baseline === "alphabetic") return drawCall.y;
      const ascent = Number.isFinite(drawCall.actualBoundingBoxAscent) ? drawCall.actualBoundingBoxAscent : fontSize * 0.8;
      const descent = Number.isFinite(drawCall.actualBoundingBoxDescent) ? drawCall.actualBoundingBoxDescent : fontSize * 0.2;
      if (baseline === "top" || baseline === "hanging") return drawCall.y + ascent;
      if (baseline === "middle") return drawCall.y + (ascent - descent) / 2;
      if (baseline === "bottom" || baseline === "ideographic") return drawCall.y - descent;
      return drawCall.y;
    }
    function rpgMakerChoiceInfo(owner, bitmap, x, y, width, height) {
      if (!owner || !rpgMakerChoiceWindow(owner)) return null;
      const spriteChoices = Array.isArray(owner._selectImgList) ? owner._selectImgList : [];
      const spriteIndex = spriteChoices.findIndex((sprite) => sprite?._textSprite?.bitmap === bitmap);
      if (spriteIndex >= 0) {
        return { index: spriteIndex, sprite: spriteChoices[spriteIndex] };
      }
      const maxItems = Math.min(1e3, Math.max(0, Number(owner.maxItems?.()) || 0));
      let best = null;
      for (let index = 0; index < maxItems; index += 1) {
        let rect;
        try {
          rect = owner.itemRectForText?.(index) || owner.itemRect?.(index);
        } catch {
          continue;
        }
        if (!rect) continue;
        const candidate = {
          x: Number(rect.x) || 0,
          y: Number(rect.y) || 0,
          width: Math.max(1, Number(rect.width) || 0),
          height: Math.max(1, Number(rect.height) || height)
        };
        const overlapX = Math.max(0, Math.min(x + width, candidate.x + candidate.width) - Math.max(x, candidate.x));
        const overlapY = Math.max(0, Math.min(y + height, candidate.y + candidate.height) - Math.max(y, candidate.y));
        const score = overlapX * overlapY;
        if (score > 0 && (!best || score > best.score)) best = { index, rect: candidate, score };
      }
      return best ? { index: best.index, rect: best.rect } : null;
    }
    function rpgMakerChoiceWindow(owner) {
      const ChoiceList = window.Window_ChoiceList;
      if (typeof ChoiceList === "function") {
        try {
          if (owner instanceof ChoiceList) return true;
        } catch {
        }
      }
      return /choice/iu.test(String(owner?.constructor?.name || ""));
    }
    function canvasTextLeft(x, width, align) {
      if (align === "center") return x - width / 2;
      if (align === "right" || align === "end") return x - width;
      return x;
    }
    function canvasTextTop(y, fontSize, height, baseline) {
      if (baseline === "top" || baseline === "hanging") return y;
      if (baseline === "middle") return y - height / 2;
      if (baseline === "bottom" || baseline === "ideographic") return y - height;
      return y - fontSize;
    }
    function adjustedTextLeft(x, maxWidth, measuredWidth, align) {
      if (align === "center") return x + Math.max(0, (maxWidth - measuredWidth) / 2);
      if (align === "right") return x + Math.max(0, maxWidth - measuredWidth);
      return x;
    }
    function alignmentTextBox(x, maxWidth, measuredWidth, align) {
      const widthLimit = Number(maxWidth) || 0;
      const canUseBox = (align === "center" || align === "right") && widthLimit > 0 && widthLimit < 4294967295;
      if (canUseBox) {
        return {
          x,
          width: Math.max(widthLimit, 1),
          textAlign: align
        };
      }
      return {
        x: adjustedTextLeft(x, maxWidth, measuredWidth, align),
        width: Math.max(measuredWidth, 1),
        textAlign: "left"
      };
    }
    function upsertEntry(key, next) {
      const current = overlayState.entries.get(key) || {};
      const textChanged = current.text !== next.text;
      Object.assign(current, next);
      overlayState.entries.set(key, current);
      if (textChanged) scheduleTextLog(key, current);
      scheduleFlush();
    }
    function scheduleTextLog(key, entry) {
      if (!entryIsLoggable(entry)) return;
      const text = String(entry.text || "");
      const dedupeKey = textLogDedupeKey(text);
      if (!dedupeKey) return;
      replaceTextLogTimer(key, () => {
        overlayState.textLogTimers.delete(key);
        if (overlayState.textLogValues.get(key) === dedupeKey) return;
        overlayState.textLogValues.set(key, dedupeKey);
        postParentMessage({ type: "text-log", gameId: config.gameId, text, at: Date.now() });
      });
    }
    function textLogDedupeKey(text) {
      return text.replace(/\s+/g, " ").trim();
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
    function scheduleFlush() {
      if (overlayState.raf) return;
      overlayState.raf = requestAnimationFrame(() => {
        overlayState.raf = 0;
        flushOverlay();
      });
    }
    function flushOverlay() {
      ensureOverlayDom();
      if (!overlayIsActive()) return;
      for (const [key, entry] of overlayState.entries) {
        if (!entryIsVisible(entry)) {
          if (retainOpeningRpgMakerNameEntry(entry)) continue;
          removeEntry(key, entry);
          continue;
        }
        const rect = toPageRect(entry);
        if (!rect) {
          removeEntry(key, entry);
          continue;
        }
        if (!entry.element) {
          const rpgSource = !entry.domSource && !entry.constructSource && !entry.cocosSource;
          entry.element = document.createElement(entry.domSource ? "div" : "span");
          entry.element.className = entry.domSource ? "mz-player-text-overlay-entry mz-player-text-overlay-entry-dom" : entry.constructSource ? "mz-player-text-overlay-entry mz-player-text-overlay-entry-construct2" : entry.cocosSource ? "mz-player-text-overlay-entry mz-player-text-overlay-entry-cocos" : "mz-player-text-overlay-entry mz-player-text-overlay-entry-rpg";
          if (rpgSource) {
            entry.textElement = document.createElement("span");
            entry.textElement.className = "mz-player-text-overlay-entry-rpg-text";
            entry.element.appendChild(entry.textElement);
          }
          overlayState.root.appendChild(entry.element);
        }
        if (entry.constructSource) {
          layoutConstruct2Entry(entry, rect);
        } else {
          const displayText = entry.cocosSource ? entry.displayText || entry.text : entry.text;
          const textElement = entry.textElement || entry.element;
          if (!usesExactRpgMakerCharacterPositions(entry)) {
            entry.characterSegmentSignature = "";
            if (textElement.textContent !== displayText) textElement.textContent = displayText;
          }
        }
        entry.element.setAttribute("aria-label", entry.text);
        entry.element.dataset.rpgText = entry.text;
        entry.element.dataset.gameText = entry.text;
        entry.element.removeAttribute("title");
        const isChoice = Number.isInteger(entry.choiceIndex);
        entry.element.classList.toggle("mz-player-text-overlay-entry-choice", isChoice);
        if (isChoice) {
          entry.element.setAttribute("role", "option");
          entry.element.setAttribute("aria-selected", String(Number(entry.owner?.index?.()) === entry.choiceIndex));
          entry.element.dataset.choiceIndex = String(entry.choiceIndex);
        } else {
          entry.element.removeAttribute("role");
          entry.element.removeAttribute("aria-selected");
          delete entry.element.dataset.choiceIndex;
        }
        setStyleIfChanged(entry.element, "left", `${rect.left}px`);
        setStyleIfChanged(entry.element, "top", `${rect.top}px`);
        setStyleIfChanged(entry.element, "width", `${Math.max(1, rect.width)}px`);
        setStyleIfChanged(entry.element, "height", `${Math.max(1, rect.height)}px`);
        setStyleIfChanged(entry.element, "textAlign", entry.textAlign || "left");
        const usesEngineTransform = entry.cocosSource || entry.constructSource;
        setStyleIfChanged(entry.element, "transformOrigin", usesEngineTransform ? "0 0" : "");
        setStyleIfChanged(entry.element, "transform", usesEngineTransform ? rect.transform || "none" : "");
        if (entry.domSource) {
          const scaleX = entry.visualScaleX || 1;
          const scaleY = entry.visualScaleY || 1;
          const fontSize = Math.max(1, (entry.fontSize || rect.fontSize) * scaleY);
          setStyleIfChanged(entry.element, "fontFamily", entry.fontFace || "sans-serif");
          setStyleIfChanged(entry.element, "fontSize", `${fontSize}px`);
          setStyleIfChanged(entry.element, "fontStyle", entry.fontStyle || "normal");
          setStyleIfChanged(entry.element, "fontWeight", entry.fontWeight || "normal");
          setStyleIfChanged(entry.element, "fontStretch", entry.fontStretch || "normal");
          setStyleIfChanged(entry.element, "fontVariant", entry.fontVariant || "normal");
          setStyleIfChanged(entry.element, "fontKerning", entry.fontKerning || "auto");
          setStyleIfChanged(entry.element, "fontOpticalSizing", entry.fontOpticalSizing || "auto");
          setStyleIfChanged(entry.element, "fontFeatureSettings", entry.fontFeatureSettings || "normal");
          setStyleIfChanged(entry.element, "fontVariationSettings", entry.fontVariationSettings || "normal");
          setStyleIfChanged(entry.element, "fontSynthesis", entry.fontSynthesis || "weight style small-caps");
          setStyleIfChanged(entry.element, "lineHeight", scaledCssLength(entry.lineHeightCss, scaleY));
          setStyleIfChanged(entry.element, "whiteSpace", entry.whiteSpace || "pre-wrap");
          setStyleIfChanged(entry.element, "direction", entry.direction || "ltr");
          setStyleIfChanged(entry.element, "letterSpacing", scaledCssLength(entry.letterSpacing, scaleX));
          setStyleIfChanged(entry.element, "wordSpacing", scaledCssLength(entry.wordSpacing, scaleX));
          setStyleIfChanged(entry.element, "wordBreak", entry.wordBreak || "normal");
          setStyleIfChanged(entry.element, "overflowWrap", entry.overflowWrap || "normal");
          setStyleIfChanged(entry.element, "writingMode", entry.writingMode || "horizontal-tb");
          setStyleIfChanged(entry.element, "textOrientation", entry.textOrientation || "mixed");
          setStyleIfChanged(entry.element, "textRendering", entry.textRendering || "auto");
          setStyleIfChanged(entry.element, "textTransform", entry.textTransform || "none");
          setStyleIfChanged(entry.element, "textAlignLast", entry.textAlignLast || "auto");
          setStyleIfChanged(entry.element, "textIndent", scaledCssLength(entry.textIndent, scaleX));
          setStyleIfChanged(entry.element, "textDecorationLine", entry.textDecorationLine || "none");
          setStyleIfChanged(entry.element, "textDecorationStyle", entry.textDecorationStyle || "solid");
          setStyleIfChanged(entry.element, "textDecorationThickness", scaledCssLength(entry.textDecorationThickness, scaleY));
          setStyleIfChanged(entry.element, "paddingTop", scaledCssLength(entry.paddingTop, scaleY));
          setStyleIfChanged(entry.element, "paddingRight", scaledCssLength(entry.paddingRight, scaleX));
          setStyleIfChanged(entry.element, "paddingBottom", scaledCssLength(entry.paddingBottom, scaleY));
          setStyleIfChanged(entry.element, "paddingLeft", scaledCssLength(entry.paddingLeft, scaleX));
          setStyleIfChanged(entry.element, "boxSizing", "border-box");
          setStyleIfChanged(entry.element, "borderStyle", "solid");
          setStyleIfChanged(entry.element, "borderColor", "transparent");
          setStyleIfChanged(entry.element, "borderTopWidth", scaledCssLength(entry.borderTopWidth, scaleY));
          setStyleIfChanged(entry.element, "borderRightWidth", scaledCssLength(entry.borderRightWidth, scaleX));
          setStyleIfChanged(entry.element, "borderBottomWidth", scaledCssLength(entry.borderBottomWidth, scaleY));
          setStyleIfChanged(entry.element, "borderLeftWidth", scaledCssLength(entry.borderLeftWidth, scaleX));
        } else if (entry.constructSource) {
          setStyleIfChanged(entry.element, "whiteSpace", "pre");
        } else if (entry.cocosSource) {
          setStyleIfChanged(entry.element, "whiteSpace", "pre");
          setStyleIfChanged(entry.element, "fontFamily", entry.fontFace || "sans-serif");
          setStyleIfChanged(entry.element, "fontSize", `${Math.max(1, rect.fontSize)}px`);
          setStyleIfChanged(entry.element, "fontStyle", entry.fontStyle || "normal");
          setStyleIfChanged(entry.element, "fontWeight", entry.fontWeight || "400");
          setStyleIfChanged(entry.element, "fontKerning", "auto");
          setStyleIfChanged(entry.element, "fontVariantLigatures", "normal");
          setStyleIfChanged(entry.element, "textDecorationLine", entry.textDecoration || "none");
          setStyleIfChanged(entry.element, "lineHeight", `${Math.max(1, entry.lineHeight || rect.fontSize * 1.2)}px`);
          setStyleIfChanged(entry.element, "paddingTop", `${Math.max(0, entry.paddingTop || 0)}px`);
        } else {
          const textElement = entry.textElement || entry.element;
          const textRect = rect.textRect || {
            left: 0,
            top: 0,
            width: rect.width,
            height: rect.height,
            baselineOffset: rect.baselineOffset
          };
          setStyleIfChanged(textElement, "left", `${roundCssPixel(textRect.left)}px`);
          setStyleIfChanged(textElement, "top", `${roundCssPixel(textRect.top)}px`);
          setStyleIfChanged(textElement, "width", `${Math.max(1, roundCssPixel(textRect.width))}px`);
          setStyleIfChanged(textElement, "height", `${Math.max(1, roundCssPixel(textRect.height))}px`);
          setStyleIfChanged(textElement, "whiteSpace", "pre");
          setStyleIfChanged(textElement, "fontFamily", entry.fontFace || "sans-serif");
          setStyleIfChanged(textElement, "fontSize", `${Math.max(1, rect.fontSize)}px`);
          setStyleIfChanged(textElement, "fontStyle", entry.fontStyle || "normal");
          setStyleIfChanged(textElement, "fontWeight", entry.fontWeight || "400");
          setStyleIfChanged(textElement, "fontStretch", entry.fontStretch || "normal");
          setStyleIfChanged(textElement, "fontVariantCaps", entry.fontVariantCaps || "normal");
          setStyleIfChanged(textElement, "fontKerning", entry.fontKerning || "auto");
          setStyleIfChanged(textElement, "fontVariantLigatures", "normal");
          setStyleIfChanged(textElement, "fontSynthesis", "weight style");
          setStyleIfChanged(textElement, "letterSpacing", entry.letterSpacing || "0px");
          setStyleIfChanged(textElement, "wordSpacing", entry.wordSpacing || "0px");
          setStyleIfChanged(textElement, "direction", entry.direction === "rtl" ? "rtl" : "ltr");
          setStyleIfChanged(textElement, "textAlign", entry.textAlign || "left");
          setStyleIfChanged(textElement, "textRendering", "auto");
          layoutRpgMakerCharacterSegments(entry, textElement, textRect);
          if (Number.isFinite(textRect.baselineOffset)) {
            const domBaseline = domTextBaselineOffset(entry, rect.fontSize);
            const baselineShift = textRect.baselineOffset - domBaseline;
            setStyleIfChanged(textElement, "lineHeight", "normal");
            setStyleIfChanged(textElement, "transformOrigin", "0 0");
            setStyleIfChanged(textElement, "transform", `translateY(${roundCssPixel(baselineShift)}px)`);
          } else {
            setStyleIfChanged(textElement, "lineHeight", `${Math.max(1, textRect.height)}px`);
            setStyleIfChanged(textElement, "transformOrigin", "");
            setStyleIfChanged(textElement, "transform", "");
          }
        }
      }
    }
    function usesExactRpgMakerCharacterPositions(entry) {
      if (!Array.isArray(entry.characterSegments) || entry.characterSegments.length < 2) return false;
      const MessageWindow = window.Window_Message;
      if (typeof MessageWindow === "function") {
        try {
          if (entry.owner instanceof MessageWindow) return true;
        } catch {
        }
      }
      return entry.owner?.constructor?.name === "Window_Message";
    }
    function layoutRpgMakerCharacterSegments(entry, textElement, textRect) {
      if (!usesExactRpgMakerCharacterPositions(entry)) return;
      const segments = entry.characterSegments;
      const signature = segments.map((segment) => `${segment.text}:${segment.x}:${segment.width}`).join("|");
      if (entry.characterSegmentSignature !== signature) {
        const fragment = document.createDocumentFragment();
        for (const segment of segments) {
          const element = document.createElement("span");
          element.className = "mz-player-text-overlay-entry-rpg-segment";
          element.textContent = segment.text;
          fragment.appendChild(element);
        }
        textElement.replaceChildren(fragment);
        entry.characterSegmentElements = [...textElement.children];
        entry.characterSegmentSignature = signature;
      }
      const sourceX = Number.isFinite(textRect.sourceX) ? textRect.sourceX : entry.x;
      const sourceScaleX = Number.isFinite(textRect.sourceScaleX) ? textRect.sourceScaleX : textRect.width / Math.max(1, entry.width);
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const element = entry.characterSegmentElements?.[index];
        if (!element) continue;
        setStyleIfChanged(element, "left", `${roundCssPixel((segment.x - sourceX) * sourceScaleX)}px`);
      }
      setStyleIfChanged(textElement, "fontKerning", "none");
      setStyleIfChanged(textElement, "fontVariantLigatures", "none");
    }
    function layoutConstruct2Entry(entry, rect) {
      const source = entry.constructSource;
      const sourceWidth = Math.abs(Number(source.width));
      const sourceHeight = Math.abs(Number(source.height));
      const characterHeight = Number(source.characterHeight);
      const characterScale = Number(source.characterScale) || 1;
      const lines = Array.isArray(source.lines) ? source.lines.map((line) => ({
        text: String(line?.text ?? ""),
        width: Math.max(0, Number(line?.width) || 0)
      })) : [];
      const canPlaceSpritefontLines = sourceWidth > 0 && sourceHeight > 0 && characterHeight > 0 && lines.length > 0;
      if (!canPlaceSpritefontLines) {
        if (entry.renderedConstructText !== entry.text || entry.constructLineElements) {
          entry.element.textContent = entry.text;
          entry.constructLineElements = null;
          entry.renderedConstructText = entry.text;
        }
        setStyleIfChanged(entry.element, "fontFamily", entry.fontFace || "sans-serif");
        setStyleIfChanged(entry.element, "fontSize", `${Math.max(1, rect.fontSize)}px`);
        setStyleIfChanged(entry.element, "fontStyle", entry.fontStyle || "normal");
        setStyleIfChanged(entry.element, "fontWeight", entry.fontWeight || "400");
        setStyleIfChanged(entry.element, "lineHeight", `${Math.max(1, rect.lineHeight || rect.fontSize * 1.2)}px`);
        setStyleIfChanged(entry.element, "paddingTop", `${Math.max(0, rect.paddingTop || 0)}px`);
        return;
      }
      const characterWidth = Math.max(1, Number(source.characterWidth) || characterHeight);
      const characterSpacing = Number(source.characterSpacing) || 0;
      const lineSignature = [
        characterWidth,
        characterScale,
        characterSpacing,
        lines.map((line) => `${line.width}:${line.text}`).join("\n")
      ].join("|");
      if (entry.constructLineSignature !== lineSignature || !entry.constructLineElements) {
        entry.element.textContent = "";
        entry.constructLineElements = lines.map((line) => {
          const element = document.createElement("span");
          element.className = "mz-player-text-overlay-entry-construct2-line";
          element.setAttribute("aria-label", line.text);
          element.replaceChildren(
            ...construct2TextSegments(line.text).map((character) => {
              const characterElement = document.createElement("span");
              characterElement.className = "mz-player-text-overlay-entry-construct2-character";
              characterElement.textContent = character;
              return characterElement;
            })
          );
          entry.element.appendChild(element);
          return element;
        });
        entry.constructLineSignature = lineSignature;
        entry.renderedConstructText = entry.text;
      }
      setStyleIfChanged(entry.element, "paddingTop", "0px");
      if (!overlayState.measureContext) {
        overlayState.measureContext = document.createElement("canvas").getContext("2d");
      }
      const scaleX = rect.width / sourceWidth;
      const scaleY = rect.height / sourceHeight;
      const cellHeight = Math.max(1, characterHeight * characterScale * scaleY);
      const lineStep = Math.max(
        1,
        (characterHeight * characterScale + (Number(source.lineHeight) || 0)) * scaleY
      );
      const fontSize = Math.max(1, cellHeight * 0.78);
      const font = `${entry.fontStyle || "normal"} ${entry.fontWeight || "400"} ${fontSize}px ${entry.fontFace || "sans-serif"}`;
      const textHeight = Math.max(0, Number(source.textHeight) || 0);
      const verticalOffset = (Number(source.valign) || 0) * Math.max(0, sourceHeight - textHeight) * scaleY + (Number(source.lineHeight) || 0) * scaleY;
      const horizontalAlignment = Number(source.halign) || 0;
      const context = overlayState.measureContext;
      if (context) context.font = font;
      for (let index = 0; index < entry.constructLineElements.length; index += 1) {
        const element = entry.constructLineElements[index];
        const line = lines[index];
        const targetWidth = Math.max(1, line.width * scaleX);
        const left = horizontalAlignment * Math.max(0, sourceWidth - line.width) * scaleX;
        const top = verticalOffset + index * lineStep;
        setStyleIfChanged(element, "left", `${roundCssPixel(left)}px`);
        setStyleIfChanged(element, "top", `${roundCssPixel(top)}px`);
        setStyleIfChanged(element, "width", `${roundCssPixel(targetWidth)}px`);
        setStyleIfChanged(element, "height", `${roundCssPixel(cellHeight)}px`);
        setStyleIfChanged(element, "font", font);
        setStyleIfChanged(element, "lineHeight", `${roundCssPixel(cellHeight)}px`);
        setStyleIfChanged(element, "transform", "");
        let characterX = 0;
        const characterElements = [...element.children];
        const characters = construct2TextSegments(line.text);
        for (let characterIndex = 0; characterIndex < characters.length; characterIndex += 1) {
          const character = characters[characterIndex];
          const characterElement = characterElements[characterIndex];
          if (!characterElement) continue;
          let renderedCharacterWidth = 0;
          for (let unitIndex = 0; unitIndex < character.length; unitIndex += 1) {
            let advanceWidth = characterWidth;
            try {
              advanceWidth = Math.max(
                0,
                Number(source.getCharacterWidth?.(character.charAt(unitIndex))) || characterWidth
              );
            } catch {
              advanceWidth = characterWidth;
            }
            renderedCharacterWidth += advanceWidth * characterScale;
            if (unitIndex + 1 < character.length) renderedCharacterWidth += characterSpacing;
          }
          const measuredCharacterWidth = Math.max(
            1,
            context?.measureText(character).width || renderedCharacterWidth
          );
          setStyleIfChanged(characterElement, "left", `${roundCssPixel(characterX * scaleX)}px`);
          setStyleIfChanged(
            characterElement,
            "transform",
            `scaleX(${renderedCharacterWidth * scaleX / measuredCharacterWidth})`
          );
          characterX += renderedCharacterWidth + characterSpacing;
        }
      }
    }
    function construct2TextSegments(text) {
      const value = String(text ?? "");
      try {
        const segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
        return [...segmenter.segment(value)].map((segment) => segment.segment);
      } catch {
        return Array.from(value);
      }
    }
    function setStyleIfChanged(element, name, value) {
      if (element.style[name] !== value) element.style[name] = value;
    }
    function refreshRpgMakerFontMetrics() {
      overlayState.baselineProbeCache.clear();
      scheduleFlush();
    }
    function domTextBaselineOffset(entry, fontSize) {
      const size = Math.max(1, Number(fontSize) || 24);
      const sample = String(entry.text || "Hg").slice(0, 64) || "Hg";
      const key = [
        entry.fontFace || "sans-serif",
        size,
        entry.fontStyle || "normal",
        entry.fontWeight || "400",
        entry.fontStretch || "normal",
        entry.fontVariantCaps || "normal",
        entry.letterSpacing || "0px",
        sample
      ].join("|");
      const cached = overlayState.baselineProbeCache.get(key);
      if (Number.isFinite(cached)) return cached;
      const probe = document.createElement("span");
      probe.style.position = "fixed";
      probe.style.left = "-10000px";
      probe.style.top = "0";
      probe.style.display = "inline-block";
      probe.style.visibility = "hidden";
      probe.style.pointerEvents = "none";
      probe.style.whiteSpace = "pre";
      probe.style.padding = "0";
      probe.style.margin = "0";
      probe.style.border = "0";
      probe.style.lineHeight = "normal";
      probe.style.fontFamily = entry.fontFace || "sans-serif";
      probe.style.fontSize = `${size}px`;
      probe.style.fontStyle = entry.fontStyle || "normal";
      probe.style.fontWeight = entry.fontWeight || "400";
      probe.style.fontStretch = entry.fontStretch || "normal";
      probe.style.fontVariantCaps = entry.fontVariantCaps || "normal";
      probe.style.fontKerning = entry.fontKerning || "auto";
      probe.style.fontSynthesis = "weight style";
      probe.style.letterSpacing = entry.letterSpacing || "0px";
      probe.append(document.createTextNode(sample));
      const marker = document.createElement("span");
      marker.style.display = "inline-block";
      marker.style.width = "0";
      marker.style.height = "0";
      marker.style.padding = "0";
      marker.style.margin = "0";
      marker.style.border = "0";
      probe.appendChild(marker);
      document.documentElement.appendChild(probe);
      const value = marker.getBoundingClientRect().top - probe.getBoundingClientRect().top;
      probe.remove();
      const result = Number.isFinite(value) ? value : size;
      overlayState.baselineProbeCache.set(key, result);
      return result;
    }
    function entryIsVisible(entry) {
      if (entry.domSource) return domSourceIsVisible(entry.domSource);
      if (entry.constructSource) return construct2SourceIsVisible(entry.constructSource);
      if (entry.cocosSource) return cocosSourceIsVisible(entry.cocosSource);
      const owner = entry.owner;
      if (!owner || owner.destroyed || !owner.parent) return false;
      if (!ownerBelongsToActiveScene(owner)) return false;
      const openingNameWindow = /(?:namebox|namewindow)/iu.test(String(owner.constructor?.name || "")) && typeof owner.isOpening === "function" && owner.isOpening();
      if (typeof owner.isClosed === "function" && owner.isClosed() && !openingNameWindow) return false;
      if (entry.choiceSprite && !displayObjectIsVisible(entry.choiceSprite)) return false;
      const bitmapSprite = findBitmapSprite(owner, entry.bitmap);
      if (bitmapSprite && !displayObjectIsVisible(bitmapSprite)) return false;
      return displayObjectIsVisible(owner);
    }
    function retainOpeningRpgMakerNameEntry(entry) {
      if (entry.domSource || entry.constructSource || entry.cocosSource) return false;
      const owner = entry.owner;
      if (!owner || owner.destroyed || !owner.parent) return false;
      if (!/(?:namebox|namewindow)/iu.test(String(owner.constructor?.name || ""))) return false;
      return owner.active === true || typeof owner.isOpening === "function" && owner.isOpening();
    }
    function ownerBelongsToActiveScene(owner) {
      const scene = currentScene();
      if (!scene) return true;
      return ownerBelongsToScene(owner, scene);
    }
    function ownerBelongsToScene(owner, scene) {
      let current = owner;
      let guard = 0;
      while (current && guard++ < 30) {
        if (current === scene) return true;
        current = current.parent;
      }
      return false;
    }
    function currentScene() {
      return window.SceneManager?._scene || overlayState.lastScene || null;
    }
    function toPageRect(entry) {
      if (entry.constructSource) return entry.constructRect || null;
      if (entry.cocosSource) return entry.cocosRect || null;
      if (entry.domSource) {
        const rect2 = entry.domSource.getBoundingClientRect();
        if (rect2.width <= 0 || rect2.height <= 0) return null;
        return {
          left: roundCssPixel(rect2.left),
          top: roundCssPixel(rect2.top),
          width: roundCssPixel(rect2.width),
          height: roundCssPixel(rect2.height),
          fontSize: entry.fontSize || 24
        };
      }
      const graphics = window.Graphics;
      const canvas = graphics && graphics._canvas;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const scaleX = rect.width / (graphics.width || canvas.width || rect.width || 1);
      const scaleY = rect.height / (graphics.height || canvas.height || rect.height || 1);
      const content = contentGeometry(entry);
      const clipped = intersectRects(entry, {
        x: content.originX,
        y: content.originY,
        width: content.visibleWidth,
        height: content.visibleHeight
      });
      if (!clipped || clipped.width <= 0 || clipped.height <= 0) return null;
      const pageLeft = rect.left + (content.x - content.originX + clipped.x) * scaleX;
      const pageTop = rect.top + (content.y - content.originY + clipped.y) * scaleY;
      const pageWidth = clipped.width * scaleX;
      const pageHeight = clipped.height * scaleY;
      if (pageLeft >= rect.right || pageTop >= rect.bottom || pageLeft + pageWidth <= rect.left || pageTop + pageHeight <= rect.top) return null;
      const textRect = {
        left: roundCssPixel(pageLeft),
        top: roundCssPixel(pageTop),
        width: roundCssPixel(pageWidth),
        height: roundCssPixel(pageHeight),
        fontSize: roundCssPixel((entry.fontSize || entry.height || 24) * scaleY),
        baselineOffset: Number.isFinite(entry.baseline) ? roundCssPixel((entry.baseline - clipped.y) * scaleY) : void 0,
        sourceX: clipped.x,
        sourceScaleX: scaleX
      };
      const choiceRect = choicePageRect(entry, canvas, rect, graphics, content, scaleX, scaleY);
      if (!choiceRect) {
        return {
          ...textRect,
          textRect: {
            left: 0,
            top: 0,
            width: textRect.width,
            height: textRect.height,
            baselineOffset: textRect.baselineOffset,
            sourceX: textRect.sourceX,
            sourceScaleX: textRect.sourceScaleX
          }
        };
      }
      return {
        ...choiceRect,
        fontSize: textRect.fontSize,
        textRect: {
          left: textRect.left - choiceRect.left,
          top: textRect.top - choiceRect.top,
          width: textRect.width,
          height: textRect.height,
          baselineOffset: textRect.baselineOffset,
          sourceX: textRect.sourceX,
          sourceScaleX: textRect.sourceScaleX
        }
      };
    }
    function choicePageRect(entry, canvas, canvasRect, graphics, content, scaleX, scaleY) {
      if (!Number.isInteger(entry.choiceIndex)) return null;
      if (entry.choiceSprite) {
        return displayObjectPageBounds(
          entry.choiceSprite,
          canvasRect,
          graphics.width || canvas.width,
          graphics.height || canvas.height
        );
      }
      if (!entry.choiceLocalRect) return null;
      const clipped = intersectRects(entry.choiceLocalRect, {
        x: content.originX,
        y: content.originY,
        width: content.visibleWidth,
        height: content.visibleHeight
      });
      if (!clipped) return null;
      return {
        left: roundCssPixel(canvasRect.left + (content.x - content.originX + clipped.x) * scaleX),
        top: roundCssPixel(canvasRect.top + (content.y - content.originY + clipped.y) * scaleY),
        width: roundCssPixel(clipped.width * scaleX),
        height: roundCssPixel(clipped.height * scaleY)
      };
    }
    function displayObjectPageBounds(object, canvasRect, canvasWidth, canvasHeight) {
      if (!object || !displayObjectIsVisible(object)) return null;
      const frame = spriteFrame(object);
      if (frame.width <= 0 || frame.height <= 0) return null;
      const anchorX = Number(object.anchor?.x) || 0;
      const anchorY = Number(object.anchor?.y) || 0;
      const matrix = object.worldTransform || object.transform?.worldTransform;
      let points;
      if (matrix && [matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty].every(Number.isFinite)) {
        const left2 = -anchorX * frame.width;
        const top2 = -anchorY * frame.height;
        points = [
          transformPoint(matrix, left2, top2),
          transformPoint(matrix, left2 + frame.width, top2),
          transformPoint(matrix, left2 + frame.width, top2 + frame.height),
          transformPoint(matrix, left2, top2 + frame.height)
        ];
      } else {
        const position = ownerWorldPosition(object);
        const left2 = position.x - anchorX * frame.width;
        const top2 = position.y - anchorY * frame.height;
        points = [
          { x: left2, y: top2 },
          { x: left2 + frame.width, y: top2 },
          { x: left2 + frame.width, y: top2 + frame.height },
          { x: left2, y: top2 + frame.height }
        ];
      }
      const cssScaleX = canvasRect.width / (Number(canvasWidth) || canvasRect.width || 1);
      const cssScaleY = canvasRect.height / (Number(canvasHeight) || canvasRect.height || 1);
      const cssPoints = points.map((point) => ({
        x: canvasRect.left + point.x * cssScaleX,
        y: canvasRect.top + point.y * cssScaleY
      }));
      const left = Math.min(...cssPoints.map((point) => point.x));
      const top = Math.min(...cssPoints.map((point) => point.y));
      const right = Math.max(...cssPoints.map((point) => point.x));
      const bottom = Math.max(...cssPoints.map((point) => point.y));
      return {
        left: roundCssPixel(left),
        top: roundCssPixel(top),
        width: roundCssPixel(Math.max(1, right - left)),
        height: roundCssPixel(Math.max(1, bottom - top))
      };
    }
    function transformPoint(matrix, x, y) {
      return {
        x: matrix.a * x + matrix.c * y + matrix.tx,
        y: matrix.b * x + matrix.d * y + matrix.ty
      };
    }
    function contentGeometry(entry) {
      const owner = entry.owner;
      const sprite = contentSpriteFor(owner, entry.bitmap);
      if (sprite) {
        const position = ownerWorldPosition(sprite);
        const frame = spriteFrame(sprite);
        const anchorX = Number(sprite.anchor?.x) || 0;
        const anchorY = Number(sprite.anchor?.y) || 0;
        return {
          x: position.x - anchorX * frame.width,
          y: position.y - anchorY * frame.height,
          originX: frame.x,
          originY: frame.y,
          visibleWidth: frame.width,
          visibleHeight: frame.height
        };
      }
      const ownerPos = ownerWorldPosition(owner);
      const padding = Number(owner.padding) || 0;
      const originX = owner.origin ? Number(owner.origin.x) || 0 : 0;
      const originY = owner.origin ? Number(owner.origin.y) || 0 : 0;
      return {
        x: ownerPos.x + padding,
        y: ownerPos.y + padding,
        originX,
        originY,
        visibleWidth: Math.max(0, (Number(owner.width) || Number(owner._width) || 0) - padding * 2),
        visibleHeight: Math.max(0, (Number(owner.height) || Number(owner._height) || 0) - padding * 2)
      };
    }
    function contentSpriteFor(owner, bitmap) {
      const candidates = [
        owner && owner._windowContentsSprite,
        owner && owner._contentsSprite
      ];
      const matching = candidates.find((sprite) => sprite && sprite.bitmap === bitmap);
      return matching || findBitmapSprite(owner, bitmap) || candidates.find(Boolean) || null;
    }
    function findBitmapSprite(owner, bitmap) {
      if (!owner || !bitmap) return null;
      const queue = Array.isArray(owner.children) ? [...owner.children] : [];
      const seen = /* @__PURE__ */ new Set();
      while (queue.length && seen.size < 3e3) {
        const current = queue.shift();
        if (!current || seen.has(current)) continue;
        seen.add(current);
        if (current.bitmap === bitmap || current._bitmap === bitmap) return current;
        if (Array.isArray(current.children)) queue.push(...current.children);
      }
      return null;
    }
    function spriteFrame(sprite) {
      const frame = sprite && (sprite._frame || sprite._realFrame);
      const width = Number(frame && frame.width) || Number(sprite.width) || 0;
      const height = Number(frame && frame.height) || Number(sprite.height) || 0;
      return {
        x: Number(frame && frame.x) || 0,
        y: Number(frame && frame.y) || 0,
        width: Math.max(0, width),
        height: Math.max(0, height)
      };
    }
    function roundCssPixel(value) {
      return Math.round(value * 2) / 2;
    }
    function displayObjectIsVisible(object) {
      let current = object;
      let guard = 0;
      while (current && guard++ < 30) {
        if (current.visible === false || current.renderable === false || current.alpha === 0) return false;
        current = current.parent;
      }
      return true;
    }
    function rectsIntersect(a, b) {
      return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    }
    function intersectRects(a, b) {
      const x1 = Math.max(a.x, b.x);
      const y1 = Math.max(a.y, b.y);
      const x2 = Math.min(a.x + a.width, b.x + b.width);
      const y2 = Math.min(a.y + a.height, b.y + b.height);
      if (x2 <= x1 || y2 <= y1) return null;
      return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    }
    function ownerWorldPosition(owner) {
      let x = 0;
      let y = 0;
      let current = owner;
      let guard = 0;
      while (current && guard++ < 20) {
        x += Number(current.x) || 0;
        y += Number(current.y) || 0;
        current = current.parent;
      }
      return { x, y };
    }
    function hashText(text) {
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i) | 0;
      }
      return (hash >>> 0).toString(36);
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
      scheduleFlush
    };
  }

  // player-runtime/bridge/viewport.ts
  function detectNativeGameSize({ graphics, tyranoConfig, canvas }) {
    function size(width, height) {
      const normalizedWidth = positiveFiniteNumber(width);
      const normalizedHeight = positiveFiniteNumber(height);
      return normalizedWidth && normalizedHeight ? { width: normalizedWidth, height: normalizedHeight } : null;
    }
    return size(graphics?.width || graphics?._width || graphics?.boxWidth, graphics?.height || graphics?._height || graphics?.boxHeight) || size(tyranoConfig?.scWidth, tyranoConfig?.scHeight) || size(canvas?.width, canvas?.height);
  }
  function createViewportBridge({ postParentMessage, scheduleFlush }) {
    let latestPlayerViewport = null;
    let lastAppliedViewport = "";
    let viewportFitFrame = 0;
    function nativeGameSize() {
      return detectNativeGameSize({
        graphics: window.Graphics,
        tyranoConfig: window.TYRANO?.kag?.config || window.config,
        canvas: document.querySelector("canvas")
      });
    }
    function installViewportBridge() {
      const notify = () => {
        const detected = nativeGameSize();
        if (!detected) return false;
        postParentMessage({ type: "game-viewport", ...detected });
        return true;
      };
      notify();
      window.addEventListener("resize", notify);
      const timer = window.setInterval(() => {
        if (notify()) window.clearInterval(timer);
      }, 250);
      window.addEventListener("resize", scheduleViewportFit);
      scheduleViewportFit();
    }
    function updatePlayerViewport(message) {
      const width = positiveFiniteNumber(message.width);
      const height = positiveFiniteNumber(message.height);
      if (!width || !height) return;
      latestPlayerViewport = { width, height };
      scheduleViewportFit();
    }
    function playerFrameRect() {
      try {
        const rect = window.frameElement?.getBoundingClientRect?.();
        if (rect && rect.width > 0 && rect.height > 0) return rect;
      } catch {
      }
      return null;
    }
    function playerViewport() {
      const rect = playerFrameRect();
      return {
        width: rect?.width || latestPlayerViewport?.width || window.innerWidth || document.documentElement.clientWidth,
        height: rect?.height || latestPlayerViewport?.height || window.innerHeight || document.documentElement.clientHeight
      };
    }
    function notifyRpgMakerViewport(width, height) {
      const graphics = window.Graphics;
      if (!graphics || typeof graphics !== "object") return;
      const nativeWidth = Number(graphics.width || graphics._width || 0);
      const nativeHeight = Number(graphics.height || graphics._height || 0);
      const viewportKey = `${width}x${height}@${nativeWidth}x${nativeHeight}`;
      if (viewportKey === lastAppliedViewport) return;
      lastAppliedViewport = viewportKey;
      try {
        if (typeof graphics._onWindowResize === "function") {
          graphics._onWindowResize();
        } else if (typeof graphics._updateAllElements === "function") {
          graphics._updateAllElements();
        }
      } catch (error) {
        lastAppliedViewport = "";
        console.warn("[Local Web Game Player viewport] Could not notify RPG Maker resize.", error);
      }
    }
    function rpgMakerNativeSize() {
      const graphics = window.Graphics;
      if (!graphics || typeof graphics !== "object") return null;
      const width = Number(graphics.width || graphics._width || graphics.boxWidth || 0);
      const height = Number(graphics.height || graphics._height || graphics.boxHeight || 0);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
      return { width, height };
    }
    function containedRect(viewportWidth, viewportHeight, nativeWidth, nativeHeight) {
      const scale = Math.min(viewportWidth / nativeWidth, viewportHeight / nativeHeight);
      const width = Math.max(1, Math.floor(nativeWidth * scale));
      const height = Math.max(1, Math.floor(nativeHeight * scale));
      return {
        left: Math.floor((viewportWidth - width) / 2),
        top: Math.floor((viewportHeight - height) / 2),
        width,
        height
      };
    }
    function applyDocumentViewport(width, height) {
      document.documentElement.style.background = "#000";
      document.documentElement.style.width = `${width}px`;
      document.documentElement.style.height = `${height}px`;
      document.documentElement.style.overflow = "hidden";
      document.body.style.background = "#000";
      document.body.style.margin = "0";
      document.body.style.width = `${width}px`;
      document.body.style.height = `${height}px`;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.inset = "0";
    }
    function playerLayers() {
      return Array.from(document.querySelectorAll("canvas, video"));
    }
    function layerNativeSize(layer) {
      const width = Number(layer.videoWidth || layer.width || 0);
      const height = Number(layer.videoHeight || layer.height || 0);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
      return { width, height };
    }
    function applyLayerRect(layer, rect) {
      layer.style.position = "absolute";
      layer.style.left = `${rect.left}px`;
      layer.style.top = `${rect.top}px`;
      layer.style.right = "auto";
      layer.style.bottom = "auto";
      layer.style.width = `${rect.width}px`;
      layer.style.height = `${rect.height}px`;
      layer.style.maxWidth = "none";
      layer.style.maxHeight = "none";
      layer.style.transform = "";
      layer.style.transformOrigin = "";
      layer.style.objectFit = "";
    }
    function applyGenericContainedFit(viewportWidth, viewportHeight) {
      for (const layer of playerLayers()) {
        const nativeSize = layerNativeSize(layer);
        if (!nativeSize) continue;
        applyLayerRect(layer, containedRect(viewportWidth, viewportHeight, nativeSize.width, nativeSize.height));
      }
    }
    function applyRpgMakerFit(viewportWidth, viewportHeight) {
      const nativeSize = rpgMakerNativeSize();
      notifyRpgMakerViewport(viewportWidth, viewportHeight);
      if (!nativeSize) {
        applyGenericContainedFit(viewportWidth, viewportHeight);
        return;
      }
      const rect = containedRect(viewportWidth, viewportHeight, nativeSize.width, nativeSize.height);
      for (const layer of playerLayers()) {
        applyLayerRect(layer, rect);
      }
    }
    function applyViewportFit() {
      const { width, height } = playerViewport();
      if (!width || !height) return;
      applyDocumentViewport(width, height);
      if (window.Graphics && typeof window.Graphics === "object") {
        applyRpgMakerFit(width, height);
        scheduleFlush();
        return;
      }
      applyGenericContainedFit(width, height);
    }
    function scheduleViewportFit() {
      if (viewportFitFrame) return;
      viewportFitFrame = window.requestAnimationFrame(() => {
        viewportFitFrame = 0;
        try {
          applyViewportFit();
        } catch (error) {
          console.warn("[Local Web Game Player viewport] Could not fit player viewport.", error);
        }
      });
    }
    return {
      installViewportBridge,
      updatePlayerViewport
    };
  }

  // player-runtime/bridge/encryptionFallback.ts
  var RPG_MAKER_HEADER_HEX = "5250474d560000000003010000000000";
  var ENCRYPTION_FALLBACK_INSTALL_INTERVAL_MS = 10;
  var MAX_ENCRYPTION_FALLBACK_INSTALL_ATTEMPTS = 500;
  var PNG_HEADER_BYTES = new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    0,
    0,
    0,
    13,
    73,
    72,
    68,
    82
  ]);
  var JPEG_HEADER_BYTES = new Uint8Array([255, 216, 255]);
  var GIF87A_HEADER_BYTES = new Uint8Array([71, 73, 70, 56, 55, 97]);
  var GIF89A_HEADER_BYTES = new Uint8Array([71, 73, 70, 56, 57, 97]);
  var WEBP_RIFF_HEADER_BYTES = new Uint8Array([82, 73, 70, 70]);
  var WEBP_WEBP_HEADER_BYTES = new Uint8Array([87, 69, 66, 80]);
  var OGG_HEADER_BYTES = new Uint8Array([79, 103, 103, 83]);
  var RIFF_HEADER_BYTES = new Uint8Array([82, 73, 70, 70]);
  var WAVE_HEADER_BYTES = new Uint8Array([87, 65, 86, 69]);
  var ID3_HEADER_BYTES = new Uint8Array([73, 68, 51]);
  var MP4_FTYP_HEADER_BYTES = new Uint8Array([102, 116, 121, 112]);
  function bytesToHex(bytes) {
    let output = "";
    for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
    return output;
  }
  function startsWithBytes(bytes, expected) {
    if (!bytes || bytes.byteLength < expected.byteLength) return false;
    for (let index = 0; index < expected.byteLength; index += 1) {
      if (bytes[index] !== expected[index]) return false;
    }
    return true;
  }
  function hasRpgMakerHeader(bytes) {
    if (!bytes || bytes.byteLength < 32) return false;
    return bytesToHex(bytes.slice(0, 16)) === RPG_MAKER_HEADER_HEX;
  }
  function imageMimeTypeForArrayBuffer(arrayBuffer) {
    if (!arrayBuffer) return void 0;
    const bytes = new Uint8Array(arrayBuffer);
    if (startsWithBytes(bytes, PNG_HEADER_BYTES)) return "image/png";
    if (startsWithBytes(bytes, JPEG_HEADER_BYTES)) return "image/jpeg";
    if (startsWithBytes(bytes, GIF87A_HEADER_BYTES) || startsWithBytes(bytes, GIF89A_HEADER_BYTES)) {
      return "image/gif";
    }
    if (bytes.byteLength >= 12 && startsWithBytes(bytes, WEBP_RIFF_HEADER_BYTES) && startsWithBytes(bytes.slice(8, 12), WEBP_WEBP_HEADER_BYTES)) {
      return "image/webp";
    }
    return void 0;
  }
  function isImageArrayBuffer(arrayBuffer) {
    return Boolean(imageMimeTypeForArrayBuffer(arrayBuffer));
  }
  function isAudioArrayBuffer(arrayBuffer) {
    if (!arrayBuffer) return false;
    const bytes = new Uint8Array(arrayBuffer);
    if (startsWithBytes(bytes, OGG_HEADER_BYTES)) return true;
    if (startsWithBytes(bytes, ID3_HEADER_BYTES)) return true;
    if (bytes.byteLength >= 2 && bytes[0] === 255 && (bytes[1] & 224) === 224) return true;
    if (bytes.byteLength >= 12 && startsWithBytes(bytes, RIFF_HEADER_BYTES) && startsWithBytes(bytes.slice(8, 12), WAVE_HEADER_BYTES)) {
      return true;
    }
    return bytes.byteLength >= 12 && startsWithBytes(bytes.slice(4, 8), MP4_FTYP_HEADER_BYTES);
  }
  function isMediaArrayBuffer(arrayBuffer) {
    return isImageArrayBuffer(arrayBuffer) || isAudioArrayBuffer(arrayBuffer);
  }
  function repairRpgMakerEncryptedPng(arrayBuffer, defaultResult) {
    const encryptedBytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
    if (!hasRpgMakerHeader(encryptedBytes)) {
      if (defaultResult) return defaultResult;
      throw new Error("Header is wrong");
    }
    const body = new Uint8Array(arrayBuffer.slice(16));
    for (let index = 0; index < PNG_HEADER_BYTES.byteLength; index += 1) {
      body[index] = PNG_HEADER_BYTES[index];
    }
    return body.buffer;
  }
  function createImageBlobUrl(arrayBuffer) {
    const mimeType = imageMimeTypeForArrayBuffer(arrayBuffer);
    if (mimeType && typeof Blob !== "undefined" && window.URL && typeof window.URL.createObjectURL === "function") {
      return window.URL.createObjectURL(new Blob([arrayBuffer], { type: mimeType }));
    }
    return Decrypter.createBlobUrl(arrayBuffer);
  }
  function decryptImageArrayBufferWithFallback(arrayBuffer, defaultDecrypt) {
    if (imageMimeTypeForArrayBuffer(arrayBuffer)) return arrayBuffer;
    let defaultResult;
    try {
      defaultResult = defaultDecrypt(arrayBuffer);
    } catch (error) {
      defaultResult = void 0;
    }
    if (imageMimeTypeForArrayBuffer(defaultResult)) return defaultResult;
    return repairRpgMakerEncryptedPng(arrayBuffer, defaultResult);
  }
  function decryptMediaArrayBufferWithFallback(arrayBuffer, defaultDecrypt) {
    if (isMediaArrayBuffer(arrayBuffer)) return arrayBuffer;
    let defaultResult;
    try {
      defaultResult = defaultDecrypt(arrayBuffer);
    } catch (error) {
      defaultResult = void 0;
    }
    if (isMediaArrayBuffer(defaultResult)) return defaultResult;
    return repairRpgMakerEncryptedPng(arrayBuffer, defaultResult);
  }
  function patchUtilsDecryptArrayBuffer() {
    const utils = window.Utils;
    if (!utils || typeof utils.decryptArrayBuffer !== "function" || utils.decryptArrayBuffer.__MzPlayerEncryptionFallback) {
      return false;
    }
    const decryptArrayBuffer = utils.decryptArrayBuffer;
    utils.decryptArrayBuffer = function(arrayBuffer) {
      return decryptMediaArrayBufferWithFallback(arrayBuffer, (source) => {
        return decryptArrayBuffer.call(this, source);
      });
    };
    Object.defineProperty(utils.decryptArrayBuffer, "__MzPlayerEncryptionFallback", {
      value: true
    });
    return true;
  }
  function patchDecrypterDecryptImg() {
    const decrypter = window.Decrypter;
    if (!decrypter || typeof decrypter.decryptImg !== "function" || typeof decrypter.decryptArrayBuffer !== "function" || decrypter.decryptImg.__MzPlayerEncryptionFallback) {
      return false;
    }
    decrypter.decryptImg = function(url, bitmap) {
      url = this.extToEncryptExt(url);
      const requestFile = new XMLHttpRequest();
      requestFile.open("GET", url);
      requestFile.responseType = "arraybuffer";
      requestFile.send();
      requestFile.onload = function() {
        if (this.status < Decrypter._xhrOk) {
          const arrayBuffer = decryptImageArrayBufferWithFallback(requestFile.response, (source) => {
            return Decrypter.decryptArrayBuffer(source);
          });
          bitmap._image.addEventListener("load", bitmap._loadListener = Bitmap.prototype._onLoad.bind(bitmap));
          bitmap._image.addEventListener(
            "error",
            bitmap._errorListener = bitmap._loader || Bitmap.prototype._onError.bind(bitmap)
          );
          bitmap._image.src = createImageBlobUrl(arrayBuffer);
        }
      };
      requestFile.onerror = function() {
        if (bitmap._loader) {
          bitmap._loader();
        } else {
          bitmap._onError();
        }
      };
    };
    Object.defineProperty(decrypter.decryptImg, "__MzPlayerEncryptionFallback", {
      value: true
    });
    return true;
  }
  function installRpgMakerEncryptionFallback() {
    const state = window.__mzPlayerEncryptionFallbackState || {
      attempts: 0,
      decrypter: false,
      timer: void 0,
      utils: false
    };
    window.__mzPlayerEncryptionFallbackState = state;
    const install = () => {
      state.utils = patchUtilsDecryptArrayBuffer() || state.utils;
      state.decrypter = patchDecrypterDecryptImg() || state.decrypter;
      window.__mzPlayerEncryptionFallbackInstalled = state.utils || state.decrypter;
      return window.__mzPlayerEncryptionFallbackInstalled;
    };
    if (install() && state.utils && state.decrypter) return;
    if (state.timer) return;
    state.timer = setInterval(() => {
      const done = install();
      state.attempts += 1;
      if (done && state.utils && state.decrypter || state.attempts >= MAX_ENCRYPTION_FALLBACK_INSTALL_ATTEMPTS) {
        clearInterval(state.timer);
        state.timer = void 0;
      }
    }, ENCRYPTION_FALLBACK_INSTALL_INTERVAL_MS);
  }

  // player-runtime/bridge/index.ts
  (() => {
    const config = window.__MZ_PLAYER_BRIDGE__;
    if (!config || !config.gameId || window.__mzPlayerBridgeInstalled) return;
    window.__mzPlayerBridgeInstalled = true;
    const settings = createSettingsStore(config.settings);
    const postParentMessage = postParent;
    const prefix = `mz-player:${config.gameId}:`;
    patchLocalStorage(prefix);
    const overlay = createTextOverlayBridge({
      config,
      postParentMessage,
      settings
    });
    const viewport = createViewportBridge({
      postParentMessage,
      scheduleFlush: overlay.scheduleFlush
    });
    const parent = createParentBridge({
      overlay,
      postParentMessage,
      settings,
      viewport
    });
    parent.installReservedKeys();
    parent.installMessageBridge();
    parent.installErrorBridge();
    viewport.installViewportBridge();
    installRpgMakerEncryptionFallback();
    overlay.ensureOverlayDom();
    overlay.installRpgMakerOverlayHooks();
    overlay.installTyranoOverlayHooks();
    overlay.installConstruct2OverlayHooks();
    overlay.installCocosOverlayHooks();
    overlay.installDictionaryGuardInputHooks();
    overlay.refreshOverlayClasses();
    parent.postStatus();
  })();
})();
