type WolfPlayerConfig = {
  gameId: string;
  mode?: "loose" | "packed";
  woditorSrc?: string;
  settings?: WolfPlayerSettings;
};

type WolfAsset = {
  path: string;
  url: string;
  size: number;
};

type WolfAssetResponse = {
  type: "wolf-assets-response";
  requestId: string;
  assets?: WolfAsset[];
  error?: string;
};

type WolfRuntimeModule = {
  preRun: Array<(runtimeModule?: WolfRuntimeModule) => void>;
  HEAP8?: Int8Array;
  canvas?: HTMLCanvasElement;
  catchGameMessage?: (message: string) => void;
};

import { normalizeWolfPath, wolfPathKeys } from "./wolfPaths";
import { installWolfOverlay } from "./wolfOverlay";
import type { WolfPlayerSettings } from "./wolfOverlay";
import { adaptWolfGameIniBytes } from "./wolfText";

declare const Module: WolfRuntimeModule;
declare const FS: {
  analyzePath(path: string): { exists: boolean };
  mkdir(path: string): void;
  writeFile: (...values: unknown[]) => unknown;
  open: (...values: unknown[]) => unknown;
  stat: (...values: unknown[]) => unknown;
  lstat: (...values: unknown[]) => unknown;
};

const config = (window as typeof window & {
  __WOLF_PLAYER_CONFIG__?: WolfPlayerConfig;
}).__WOLF_PLAYER_CONFIG__;
const runtimeModule = (window as typeof window & { Module?: WolfRuntimeModule }).Module ?? Module;
let activeModule: WolfRuntimeModule | undefined;

function showStatus(message: string) {
  const target = document.querySelector<HTMLElement>("#touchtostart");
  if (target) target.textContent = message;
}

function requestAssets(settings: WolfPlayerConfig): Promise<WolfAsset[]> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("The browser player took too long to prepare WOLF assets."));
    }, 30000);

    function onMessage(event: MessageEvent<WolfAssetResponse>) {
      const message = event.data;
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent ||
        message?.type !== "wolf-assets-response" ||
        message.requestId !== requestId
      ) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (message.error) {
        reject(new Error(message.error));
        return;
      }
      if (!Array.isArray(message.assets) || message.assets.length === 0) {
        reject(new Error("The browser player did not provide WOLF assets."));
        return;
      }
      resolve(message.assets);
    }

    window.addEventListener("message", onMessage);
    window.parent.postMessage({
      type: "wolf-assets-request",
      gameId: settings.gameId,
      requestId,
    }, window.location.origin);
  });
}

function installAssetLoader(assets: WolfAsset[]) {
  const available = new Map<string, WolfAsset>();
  for (const asset of assets) {
    const path = normalizeWolfPath(asset.path);
    const normalized = { ...asset, path };
    for (const key of wolfPathKeys(path)) available.set(key, normalized);
  }

  const stats = {
    requests: 0,
    bytes: 0,
    files: [] as string[],
    missing: [] as string[],
  };
  (window as typeof window & { WolfLazyAssetStats?: typeof stats }).WolfLazyAssetStats = stats;
  const reportedMissing = new Set<string>();

  function ensureParents(path: string) {
    const parts = path.split("/");
    parts.pop();
    let current = "";
    for (const part of parts) {
      current += `/${part}`;
      if (!FS.analyzePath(current).exists) FS.mkdir(current);
    }
  }

  function load(path: unknown, force = false): boolean {
    const requested = normalizeWolfPath(path);
    const asset = wolfPathKeys(requested)
      .map((key) => available.get(key))
      .find((candidate) => candidate !== undefined);
    if (!asset) {
      const lower = requested.toLowerCase();
      if (
        lower.includes("data/") &&
        /\.[^/.]{1,8}$/u.test(requested) &&
        !/-(?:gamecache|save)\//iu.test(requested) &&
        !lower.endsWith(".wolf") &&
        !lower.endsWith(".wolfx") &&
        !reportedMissing.has(lower)
      ) {
        reportedMissing.add(lower);
        stats.missing.push(requested);
        console.debug(`Wolf Tools could not match asset: ${requested}`);
      }
      return false;
    }

    const absolute = `/${requested}`;
    if (!force && FS.analyzePath(absolute).exists) return true;

    const request = new XMLHttpRequest();
    request.open("GET", asset.url, false);
    request.overrideMimeType("text/plain; charset=x-user-defined");
    request.send(null);
    if (request.status < 200 || request.status >= 300) {
      throw new Error(`Could not load WOLF asset ${asset.path}. HTTP ${request.status}`);
    }

    const bytes = new Uint8Array(request.responseText.length);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = request.responseText.charCodeAt(index) & 255;
    }
    ensureParents(requested);
    FS.writeFile(absolute, bytes);
    stats.requests += 1;
    stats.bytes += bytes.byteLength;
    stats.files.push(asset.path);
    console.log(`Wolf Tools loaded asset: ${asset.path} (${bytes.byteLength} bytes)`);
    return true;
  }

  runtimeModule.preRun.push((initializedModule) => {
    activeModule = initializedModule ?? runtimeModule;
    const originalOpen = FS.open;
    const originalStat = FS.stat;
    const originalLstat = FS.lstat;
    const originalWriteFile = FS.writeFile;

    FS.open = function(path, flags) {
      const readOnly = typeof flags === "string"
        ? !/[wa+]/.test(flags)
        : ((flags as number) & 3) === 0;
      if (readOnly) load(path);
      return originalOpen.apply(FS, arguments as unknown as []);
    };
    FS.stat = function(path) {
      load(path);
      return originalStat.apply(FS, arguments as unknown as []);
    };
    FS.lstat = function(path) {
      load(path);
      return originalLstat.apply(FS, arguments as unknown as []);
    };
    FS.writeFile = function(path, data) {
      const requested = normalizeWolfPath(path);
      const bytes = data instanceof Uint8Array ? data : undefined;
      const lowerRequested = requested.toLowerCase();
      if (bytes && (lowerRequested === "game.ini" || lowerRequested.endsWith("/game.ini"))) {
        return originalWriteFile.call(FS, path, adaptWolfGameIniBytes(bytes), arguments[2]);
      }
      return originalWriteFile.apply(FS, arguments as unknown as []);
    };
    const gameIni = assets.find((asset) => {
      const path = normalizeWolfPath(asset.path).toLowerCase();
      return path === "game.ini" || path.endsWith("/game.ini");
    });
    if (gameIni) load(gameIni.path, true);
  });
}

function loadWoditor(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load Browser Woditor: ${source}`));
    document.body.append(script);
  });
}

async function start() {
  if (!config?.gameId) {
    throw new Error("The WOLF browser player configuration is missing.");
  }
  // Recent Browser Woditor builds remove the global Module reference after
  // startup. Keep the initialized object supplied to preRun so packed games
  // retain access to HEAP8 and the canvas just like loose-asset games do.
  runtimeModule.preRun.push((initializedModule) => {
    activeModule = initializedModule ?? runtimeModule;
  });
  const overlay = installWolfOverlay({
    gameId: config.gameId,
    initialSettings: config.settings,
    getHeap: () => activeModule?.HEAP8 ?? runtimeModule.HEAP8,
    getCanvas: () => activeModule?.canvas ?? runtimeModule.canvas ?? document.querySelector<HTMLCanvasElement>("#canvas, canvas"),
  });
  const originalCatchGameMessage = runtimeModule.catchGameMessage?.bind(runtimeModule);
  runtimeModule.catchGameMessage = (message) => {
    originalCatchGameMessage?.(message);
    overlay.captureText(message);
  };
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(
    this: HTMLCanvasElement,
    contextId: string,
    attributes?: unknown,
  ) {
    if (contextId === "webgl" || contextId === "webgl2" || contextId === "experimental-webgl") {
      const nextAttributes = typeof attributes === "object" && attributes
        ? { ...attributes, preserveDrawingBuffer: true }
        : { preserveDrawingBuffer: true };
      return Reflect.apply(originalGetContext, this, [contextId, nextAttributes]);
    }
    return Reflect.apply(originalGetContext, this, [contextId, attributes]);
  } as typeof HTMLCanvasElement.prototype.getContext;

  if (config.mode === "loose") {
    if (!config.woditorSrc) {
      throw new Error("The WOLF loose-asset runtime script is missing.");
    }
    showStatus("Preparing WOLF assets");
    const assets = await requestAssets(config);
    installAssetLoader(assets);
    await loadWoditor(config.woditorSrc);
  }
}

void start().catch((cause) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  showStatus(message);
  window.parent.postMessage({ type: "runtime-error", message }, window.location.origin);
});
