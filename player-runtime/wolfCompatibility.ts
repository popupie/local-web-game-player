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
};

type WolfCompatibilityOptions = {
  gameId: string;
  initialSettings?: WolfPlayerSettings;
  getCanvas: () => HTMLCanvasElement | null;
};

type WolfParentMessage = {
  type?: string;
  settings?: WolfPlayerSettings;
};

function normalizeSettings(next: WolfPlayerSettings | undefined) {
  return {
    reservedKeys: Array.isArray(next?.reservedKeys) ? next.reservedKeys : [],
    dictionaryDismissGuard: next?.dictionaryDismissGuard ?? { enabled: true, triggers: [] },
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

export function installWolfCompatibility(options: WolfCompatibilityOptions) {
  let settings = normalizeSettings(options.initialSettings);
  let viewportCandidate = "";
  let viewportCandidateSamples = 0;
  let lastReportedViewport = "";
  let lastCanvasLayout = "";

  // Browser Woditor normally owns its page layout. Inside our already-sized
  // iframe that creates a second layout system, so let the parent own the
  // viewport and keep only the game canvas visible.
  document.documentElement.classList.add("mz-player-browser-woditor");
  const style = document.createElement("style");
  style.id = "mz-player-wolf-compatibility";
  style.textContent = `
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
    html.mz-player-browser-woditor #main-header,
    html.mz-player-browser-woditor #main-footer,
    html.mz-player-browser-woditor #settings {
      display: none !important;
    }

    html.mz-player-browser-woditor #main {
      position: relative !important;
      top: 0 !important;
    }

    html.mz-player-browser-woditor #main-content {
      position: absolute !important;
      inset: 0 !important;
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
  `;
  document.documentElement.appendChild(style);

  function postParent(message: object) {
    window.parent.postMessage(message, window.location.origin);
  }

  function syncCanvasViewport(canvas: HTMLCanvasElement) {
    if (canvas.width <= 0 || canvas.height <= 0) return;
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

  function syncLayout() {
    const canvas = options.getCanvas();
    if (canvas) syncCanvasViewport(canvas);
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

  function handleParentMessage(event: MessageEvent<WolfParentMessage>) {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "focus-game") {
      focusGame();
      return;
    }
    if (message.type === "player-settings") settings = normalizeSettings(message.settings);
  }

  function handleReservedKey(event: KeyboardEvent) {
    if (event.type !== "keydown") return;
    const key = settings.reservedKeys.find(
      (item) => item.code === event.code && exactModifiers(event, item),
    );
    if (!key || key.action === "toggleOverlay" || key.action === "toggleReader") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    postParent({ type: "reserved-key", action: key.action, code: event.code });
  }

  function handleDictionaryGuard(event: KeyboardEvent) {
    const guard = settings.dictionaryDismissGuard;
    if (guard?.enabled === false || !Array.isArray(guard?.triggers)) return;
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

  for (const type of ["keydown", "keypress", "keyup"] as const) {
    window.addEventListener(type, handleReservedKey, true);
    window.addEventListener(type, handleDictionaryGuard, true);
  }
  window.addEventListener("message", handleParentMessage);
  window.addEventListener("resize", syncLayout);
  window.setInterval(syncLayout, 250);
  syncLayout();
  postParent({
    type: "overlay-availability",
    gameId: options.gameId,
    available: false,
  });
}
