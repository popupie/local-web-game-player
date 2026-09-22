// @ts-nocheck

export function createNwRuntime() {
  let clipboardText = "";
  const noop = () => undefined;
  const noopChain = function noopChain() {
    return this;
  };
  const SRD_INTENDED_WINDOW_CODE = "SRD_GameUpgrade's intended window.";
  let latestPlayerViewport = null;

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "player-viewport") return;
    const width = Number(event.data.width);
    const height = Number(event.data.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      latestPlayerViewport = { width, height };
      window.dispatchEvent(new Event("resize"));
    }
  });

  function frameElementRect() {
    try {
      const rect = window.frameElement?.getBoundingClientRect?.();
      if (rect && rect.width > 0 && rect.height > 0) return rect;
    } catch {
      // frameElement can be blocked in unusual embed contexts.
    }
    return null;
  }

  function playerFrameWidth() {
    const rect = frameElementRect();
    return (
      rect?.width ||
      latestPlayerViewport?.width ||
      window.innerWidth ||
      document.documentElement.clientWidth ||
      816
    );
  }

  function playerFrameHeight() {
    const rect = frameElementRect();
    return (
      rect?.height ||
      latestPlayerViewport?.height ||
      window.innerHeight ||
      document.documentElement.clientHeight ||
      624
    );
  }

  function setShimProperty(target, key, value) {
    try {
      target[key] = value;
      if (target[key] === value) return;
    } catch {
      // Some host objects reject direct assignment.
    }
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        value,
        writable: true,
      });
    } catch {
      // Non-extensible host objects can still be usable through the base shim.
    }
  }

  function decorateWindowShim(value) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) {
      return windowShim;
    }
    try {
      value[SRD_INTENDED_WINDOW_CODE] = true;
    } catch {
      // Some third-party shims freeze their window object. Keeping the player
      // alive matters more than decorating every optional property.
    }
    if (!value.window) setShimProperty(value, "window", window);
    const windowMethods = [
      "addListener",
      "focus",
      "close",
      "emit",
      "enterFullscreen",
      "show",
      "hide",
      "leaveFullscreen",
      "maximize",
      "minimize",
      "off",
      "on",
      "once",
      "restore",
      "moveTo",
      "resizeTo",
      "setResizable",
      "setMinimumSize",
      "setMaximumSize",
      "setPosition",
      "setAlwaysOnTop",
      "setShowInTaskbar",
      "removeListener",
      "removeAllListeners",
    ];
    for (const method of windowMethods) {
      if (typeof value[method] !== "function") setShimProperty(value, method, noopChain);
    }
    if (typeof value.showDevTools !== "function") {
      setShimProperty(value, "showDevTools", () => ({
        focus: noop,
        moveTo: noop,
        resizeTo: noop,
      }));
    }
    if (typeof value.isDevToolsOpen !== "function") {
      setShimProperty(value, "isDevToolsOpen", () => false);
    }
    return value;
  }

  function createWindowShim() {
    const listeners = new Map();
    let loaded = false;
    const shim = {
      window,
      [SRD_INTENDED_WINDOW_CODE]: true,
      get width() {
        return playerFrameWidth();
      },
      get height() {
        return playerFrameHeight();
      },
      get x() {
        return 0;
      },
      get y() {
        return 0;
      },
      focus: noop,
      close: noop,
      show: noop,
      hide: noop,
      enterFullscreen: noop,
      leaveFullscreen: noop,
      maximize: noop,
      minimize: noop,
      restore: noop,
      moveTo: noop,
      resizeTo: noop,
      setResizable: noop,
      setMinimumSize: noop,
      setMaximumSize: noop,
      setPosition: noop,
      setAlwaysOnTop: noop,
      setShowInTaskbar: noop,
      on(event, listener) {
        if (typeof listener !== "function") return shim;
        const eventName = String(event);
        const eventListeners = listeners.get(eventName) || new Set();
        eventListeners.add(listener);
        listeners.set(eventName, eventListeners);
        if (eventName === "loaded" && loaded) {
          queueMicrotask(() => listener.call(shim));
        }
        return shim;
      },
      once(event, listener) {
        if (typeof listener !== "function") return shim;
        const wrapped = function wrapped() {
          shim.off(event, wrapped);
          return listener.apply(shim, arguments);
        };
        return shim.on(event, wrapped);
      },
      off(event, listener) {
        const eventListeners = listeners.get(String(event));
        if (!eventListeners) return shim;
        if (typeof listener === "function") {
          eventListeners.delete(listener);
        } else {
          eventListeners.clear();
        }
        return shim;
      },
      removeListener(event, listener) {
        return shim.off(event, listener);
      },
      removeAllListeners(event) {
        if (event === undefined) {
          listeners.clear();
          return shim;
        }
        const eventListeners = listeners.get(String(event));
        if (eventListeners) eventListeners.clear();
        return shim;
      },
      showDevTools: () => ({ moveTo: noop, resizeTo: noop, focus: noop }),
      isDevToolsOpen: () => false,
      __emit(event) {
        const eventName = String(event);
        if (eventName === "loaded") loaded = true;
        const eventListeners = listeners.get(eventName);
        if (!eventListeners) return;
        for (const listener of Array.from(eventListeners)) {
          listener.call(shim);
        }
      },
    };
    return shim;
  }

  const windowShim = createWindowShim();
  decorateWindowShim(window);
  const nwWindowShim = {
    get: () => decorateWindowShim(windowShim),
    open(url, options, callback) {
      const openedWindow = createWindowShim();
      queueMicrotask(() => {
        if (typeof callback === "function") callback(openedWindow);
        openedWindow.__emit("loaded");
      });
      console.info("[Local Web Game Player nw.Window.open]", {
        url: String(url ?? ""),
        options: options && typeof options === "object" ? options : {},
        mode: "current-frame",
      });
      return decorateWindowShim(openedWindow);
    },
  };
  const browserWindowOpen =
    typeof window.open === "function" ? window.open.bind(window) : null;
  if (browserWindowOpen && !window.open.__MzPlayerNwWindowOpen) {
    const openWithNwDecoration = function openWithNwDecoration() {
      const opened = browserWindowOpen.apply(window, arguments);
      return decorateWindowShim(opened);
    };
    setShimProperty(openWithNwDecoration, "__MzPlayerNwWindowOpen", true);
    setShimProperty(window, "open", openWithNwDecoration);
  }
  const clipboardShim = {
    get: () => clipboardText,
    set: (value) => {
      clipboardText = String(value ?? "");
    },
    clear: () => {
      clipboardText = "";
    },
  };
  const nwAppShim = {
    argv: [],
    manifest: {},
    clearCache: noop,
    clearAppCache: noop,
    quit: noop,
  };
  const nwGuiModule = {
    App: nwAppShim,
    Window: nwWindowShim,
    Clipboard: {
      get: () => clipboardShim,
    },
  };

  function installNwCompatibility() {
    const nwObject = window.nw && typeof window.nw === "object" ? window.nw : {};
    if (!nwObject.App || typeof nwObject.App !== "object") {
      nwObject.App = nwAppShim;
    } else {
      if (!Array.isArray(nwObject.App.argv)) nwObject.App.argv = [];
      if (!nwObject.App.manifest || typeof nwObject.App.manifest !== "object") {
        nwObject.App.manifest = {};
      }
    }
    if (!nwObject.Window || typeof nwObject.Window !== "object") {
      nwObject.Window = nwGuiModule.Window;
    } else {
      const existingGet =
        typeof nwObject.Window.get === "function" ? nwObject.Window.get : null;
      nwObject.Window.get = function getWindowShim() {
        if (!existingGet) return nwWindowShim.get();
        try {
          return decorateWindowShim(existingGet.apply(this, arguments));
        } catch {
          return nwWindowShim.get();
        }
      };
      nwObject.Window.open = nwWindowShim.open;
    }
    if (!nwObject.Clipboard || typeof nwObject.Clipboard !== "object") {
      nwObject.Clipboard = nwGuiModule.Clipboard;
    }
    nwGuiModule.App = nwObject.App;
    nwGuiModule.Window = nwObject.Window;
    nwGuiModule.Clipboard = nwObject.Clipboard;
    if (window.nw !== nwObject) {
      try {
        window.nw = nwObject;
      } catch {
        Object.defineProperty(window, "nw", {
          configurable: true,
          value: nwObject,
          writable: true,
        });
      }
    }
    return nwObject;
  }

  const nwModule = installNwCompatibility();


  return {
    clipboardShim,
    nwGuiModule,
    nwModule,
    windowShim,
  };
}
