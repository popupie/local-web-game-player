// @ts-nocheck
import { createAssetRouter } from "@/player-runtime/desktop/assetRouting";
import { createCryptoRuntime } from "@/player-runtime/desktop/crypto";
import { createFsRuntime } from "@/player-runtime/desktop/fs";
import { createNodeBuiltins } from "@/player-runtime/desktop/nodeBuiltins";
import { createNwRuntime } from "@/player-runtime/desktop/nw";
import { createProcessRuntime } from "@/player-runtime/desktop/process";
import { createPathRuntime } from "@/player-runtime/desktop/path";
import {
  installRpgMakerBrowserCompatibility,
  installRpgMakerEncryptedExtensionBypass,
} from "@/player-runtime/engines/rpgmaker_mvmz/desktopCompatibility";

(() => {
  const config = window.__MZ_PLAYER_DESKTOP_CONFIG;
  if (!config || typeof config !== "object") {
    throw new Error("Local Web Game Player desktop runtime config did not load.");
  }
  const pathRuntime = createPathRuntime(config);
  const assetRouter = createAssetRouter(config, pathRuntime);
  installRpgMakerBrowserCompatibility();
  installRpgMakerEncryptedExtensionBypass(
    assetRouter.shouldBypassEncryptedExtensionRewrite,
  );
  assetRouter.installUrlPatch();

  function isMzPlayerRequireResolutionError(error) {
    return (
      error instanceof Error &&
      (
        error.message.startsWith(
          "Local Web Game Player cannot provide Node module",
        ) ||
        error.message.startsWith(
          "Local Web Game Player cannot resolve packaged module",
        )
      )
    );
  }

  function installGlobalRequireBridge(mzPlayerRequire) {
    let fallbackRequire =
      typeof window.require === "function" &&
      window.require !== mzPlayerRequire &&
      !window.require.__MzPlayerDesktopRequire
        ? window.require
        : null;

    function bridgedRequire(name) {
      try {
        return mzPlayerRequire.apply(this, arguments);
      } catch (error) {
        if (fallbackRequire && isMzPlayerRequireResolutionError(error)) {
          return fallbackRequire.apply(this, arguments);
        }
        throw error;
      }
    }

    Object.defineProperty(bridgedRequire, "__MzPlayerDesktopRequire", {
      value: true,
    });

    try {
      Object.defineProperty(window, "require", {
        configurable: true,
        get() {
          return bridgedRequire;
        },
        set(value) {
          if (value === bridgedRequire || value === mzPlayerRequire) return;
          if (typeof value === "function") fallbackRequire = value;
        },
      });
    } catch {
      window.require = bridgedRequire;
    }

    return bridgedRequire;
  }

  if (window.MzPlayerDesktop) {
    installGlobalRequireBridge(window.MzPlayerDesktop.require);
    return;
  }

  const {
    dirname,
    extname,
    joinPath,
    lookupManifestFile,
    manifestKey,
    normalizePath,
    pathModule,
  } = pathRuntime;

  const { clipboardShim, electronModule, nwGuiModule, nwModule, windowShim } = createNwRuntime();

  function bytesToBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(offset, Math.min(offset + 32768, bytes.length)),
      );
    }
    return window.btoa(binary);
  }

  const bufferModule = window.__MzPlayerBufferModule;
  const BrowserBuffer = bufferModule?.Buffer;
  if (!bufferModule || typeof BrowserBuffer?.from !== "function") {
    throw new Error("Local Web Game Player Buffer runtime did not load.");
  }
  const browserCryptoModule = window.__MzPlayerCryptoModule;
  if (!browserCryptoModule || typeof browserCryptoModule !== "object") {
    throw new Error("Local Web Game Player crypto runtime did not load.");
  }
  if (typeof window.Buffer !== "function") {
    Object.defineProperty(window, "Buffer", {
      configurable: true,
      value: BrowserBuffer,
      writable: true,
    });
  }

  function enhancedBytes(bytes) {
    return BrowserBuffer.from(bytes);
  }

  const fsRuntime = createFsRuntime({
    BrowserBuffer,
    bytesToBase64,
    config,
    enhancedBytes,
    pathRuntime,
  });
  const { fsModule, readFileSync } = fsRuntime;

  const cryptoModule = createCryptoRuntime({
    browserCryptoModule,
    enhancedBytes,
  });

  const hasSteam4C2Bridge = config.files.some((file) =>
    /(?:^|\/)Steam4C2\.js$/iu.test(String(file.path).replace(/\\+/g, "/")),
  );
  const processModule = createProcessRuntime(
    hasSteam4C2Bridge ? { platform: "win32", arch: "x64" } : {},
  );
  const requireModule = (request, parentFilename) =>
    mzPlayerRequire(request, parentFilename);
  requireModule.resolve = (request, parentFilename) =>
    mzPlayerRequire.resolve(request, parentFilename);
  const {
    commonJsModuleCache,
    commonJsRequireCache,
    greenworksNativeFallback,
    mainModule,
    modules,
    osModule,
    steamNativeFallback,
    timersModule,
  } = createNodeBuiltins({
    BrowserBuffer,
    bufferModule,
    cryptoModule,
    electronModule,
    fsModule,
    nwGuiModule,
    nwModule,
    pathModule,
    processModule,
    requireModule,
  });

  function nativeModuleBasename(name) {
    const normalized = String(name)
      .replace(/\\+/g, "/")
      .replace(/\.(?:js|node)$/iu, "")
      .toLowerCase();
    return normalized.slice(normalized.lastIndexOf("/") + 1);
  }

  function isSteamNativeModule(name) {
    return /^steam4c2-(?:win|linux|osx)(?:32|64)$/u.test(
      nativeModuleBasename(name),
    );
  }

  function isSteam4C2BridgeModule(name) {
    return nativeModuleBasename(name) === "steam4c2";
  }

  function isGreenworksModule(name) {
    const basename = nativeModuleBasename(name);
    return (
      basename === "greenworks" ||
      /^greenworks-(?:win|linux|osx|mac)(?:32|64|x64|ia32|arm64)?$/u.test(basename)
    );
  }

  function resolveAsFileOrDirectory(candidate, seen = new Set()) {
    const normalized = normalizePath(candidate);
    if (seen.has(normalized)) return null;
    seen.add(normalized);

    const fileCandidates = [normalized];
    if (!extname(normalized)) fileCandidates.push(normalized + ".js", normalized + ".json");
    for (const path of fileCandidates) {
      const file = lookupManifestFile(path);
      if (file) return file;
    }

    const packageFile = lookupManifestFile(joinPath(normalized, "package.json"));
    if (packageFile) {
      try {
        const packageData = JSON.parse(readFileSync("/" + manifestKey(packageFile.path), "utf8"));
        const entry = typeof packageData.browser === "string"
          ? packageData.browser
          : typeof packageData.main === "string"
            ? packageData.main
            : "";
        if (entry && entry !== ".") {
          const resolved = resolveAsFileOrDirectory(joinPath(normalized, entry), seen);
          if (resolved) return resolved;
        }
      } catch (error) {
        console.warn("[Local Web Game Player package.json]", packageFile.path, error);
      }
    }

    for (const path of [joinPath(normalized, "index.js"), joinPath(normalized, "index.json")]) {
      const file = lookupManifestFile(path);
      if (file) return file;
    }
    return null;
  }

  function nodeModuleRequestParts(request) {
    const parts = request.split("/").filter(Boolean);
    const packagePartCount = request.startsWith("@") ? 2 : 1;
    return {
      packageName: parts.slice(0, packagePartCount).join("/"),
      subpath: parts.slice(packagePartCount).join("/"),
    };
  }

  function resolvePackagedModule(name, parentFilename) {
    const request = String(name).replace(/\\+/g, "/");
    if (request.startsWith("/") || request.startsWith("./") || request.startsWith("../")) {
      const candidate = request.startsWith("/")
        ? normalizePath(request)
        : normalizePath(joinPath(dirname(parentFilename), request));
      return resolveAsFileOrDirectory(candidate);
    }

    const direct = resolveAsFileOrDirectory(request);
    if (direct) return direct;

    const { packageName, subpath } = nodeModuleRequestParts(request);
    if (!packageName) return null;
    let directory = dirname(parentFilename);
    const candidates = [];
    while (directory) {
      candidates.push(joinPath(directory, "node_modules", packageName, subpath));
      if (directory === "/" || directory === ".") break;
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    candidates.push(joinPath("/www/node_modules", packageName, subpath));
    for (const candidate of Array.from(new Set(candidates))) {
      const resolved = resolveAsFileOrDirectory(candidate);
      if (resolved) return resolved;
    }
    return null;
  }

  function loadPackagedModule(name, parentFilename, resolvedFile) {
    const manifestFile =
      resolvedFile ?? resolvePackagedModule(name, parentFilename);
    if (!manifestFile) {
      throw new Error(
        "Local Web Game Player cannot resolve packaged module '" +
          name +
          "' from '" +
          parentFilename +
          "'.",
      );
    }
    const filename = "/" + manifestKey(manifestFile.path);
    const cacheKey = manifestFile.path;
    if (commonJsModuleCache.has(cacheKey)) {
      return commonJsModuleCache.get(cacheKey).exports;
    }

    const module = {
      children: [],
      exports: {},
      filename,
      id: filename,
      loaded: false,
      parent: commonJsRequireCache[parentFilename] || mainModule,
      paths: [joinPath(dirname(filename), "node_modules"), "/www/node_modules", "/node_modules"],
    };
    commonJsModuleCache.set(cacheKey, module);
    commonJsRequireCache[filename] = module;
    module.parent?.children?.push(module);

    try {
      const source = readFileSync(filename, "utf8");
      if (extname(filename).toLowerCase() === ".json") {
        module.exports = JSON.parse(source);
      } else {
        const localRequire = function localRequire(request) {
          return mzPlayerRequire(request, filename);
        };
        localRequire.resolve = function resolve(request) {
          const builtin = String(request);
          if (Object.prototype.hasOwnProperty.call(modules, builtin)) return builtin;
          const file = resolvePackagedModule(request, filename);
          if (!file) {
            throw new Error(
              "Local Web Game Player cannot resolve packaged module '" +
                request +
                "' from '" +
                filename +
                "'.",
            );
          }
          return "/" + manifestKey(file.path);
        };
        localRequire.cache = commonJsRequireCache;
        localRequire.main = mainModule;
        module.require = localRequire;
        const factory = new Function(
          "exports",
          "require",
          "module",
          "__filename",
          "__dirname",
          "Buffer",
          "process",
          source + "\n//# sourceURL=" + filename,
        );
        factory(
          module.exports,
          localRequire,
          module,
          filename,
          dirname(filename),
          BrowserBuffer,
          processModule,
        );
      }
      module.loaded = true;
      return module.exports;
    } catch (error) {
      commonJsModuleCache.delete(cacheKey);
      delete commonJsRequireCache[filename];
      if (module.parent?.children) {
        const index = module.parent.children.indexOf(module);
        if (index >= 0) module.parent.children.splice(index, 1);
      }
      throw error;
    }
  }

  function mzPlayerRequire(name, parentFilename = "/www/index.html") {
    const key = String(name);
    if (isGreenworksModule(key)) {
      return greenworksNativeFallback;
    }
    if (isSteam4C2BridgeModule(key) || isSteamNativeModule(key)) {
      return steamNativeFallback;
    }
    if (Object.prototype.hasOwnProperty.call(modules, key)) {
      return modules[key];
    }
    const manifestFile = resolvePackagedModule(key, parentFilename);
    if (manifestFile) {
      return loadPackagedModule(key, parentFilename, manifestFile);
    }
    throw new Error(
      "Local Web Game Player cannot provide Node module '" +
        key +
        "' requested from '" +
        parentFilename +
        "'. Supported built-ins: " +
        Object.keys(modules).sort().join(", "),
    );
  }

  mzPlayerRequire.cache = commonJsRequireCache;
  mzPlayerRequire.main = mainModule;
  mzPlayerRequire.resolve = function resolve(request, parentFilename = mainModule.filename) {
    const builtin = String(request);
    if (Object.prototype.hasOwnProperty.call(modules, builtin)) return builtin;
    const file = resolvePackagedModule(request, parentFilename);
    if (!file) throw new Error("Cannot resolve '" + request + "' from '" + parentFilename + "'.");
    return "/" + manifestKey(file.path);
  };

  const requireBridge = installGlobalRequireBridge(mzPlayerRequire);
  requireBridge.cache = commonJsRequireCache;
  requireBridge.main = mainModule;
  requireBridge.resolve = mzPlayerRequire.resolve;
  nwModule.require = requireBridge;
  nwGuiModule.require = requireBridge;
  mainModule.require = requireBridge;
  processModule.mainModule = mainModule;

  function installGlobalValue(name, value) {
    if (window[name] !== undefined) return;
    try {
      Object.defineProperty(window, name, { configurable: true, value, writable: true });
    } catch {
      window[name] = value;
    }
  }

  installGlobalValue("global", window);
  installGlobalValue("__filename", mainModule.filename);
  installGlobalValue("__dirname", dirname(mainModule.filename));
  installGlobalValue("module", { exports: {} });
  installGlobalValue("_", modules.lodash);
  installGlobalValue("TWEEN", modules["@tweenjs/tween.js"]);
  installGlobalValue("rxjs", modules.rxjs);
  installGlobalValue("XLSX", modules.xlsx);
  installGlobalValue("setImmediate", timersModule.setImmediate);
  installGlobalValue("clearImmediate", timersModule.clearImmediate);

  window.MzPlayerDesktop = Object.freeze({
    version: 2,
    capabilities: Object.freeze([
      "fs.virtualSync",
      "fs.manifestRead",
      "fs.manifestSyncRead",
      "fs.manifestMetadata",
      "fs.commonNodeApi",
      "path.posix",
      "path.commonNodeApi",
      "nw.gui.noop",
      "nw.shell.browserSafe",
      "nw.windowOpen.currentFrame",
      "nw.globalNoop",
      "electron.browserSafe",
      "crypto.webRandom",
      "crypto.nodeCiphers",
      "process.browserCompat",
      "modules.manifestCommonJS",
      "modules.nodeModulesResolution",
      "modules.commonBuiltins",
      "buffer.commonJS",
      "buffer.global",
      "events.commonJS",
      "lodash.commonJS",
      "lodash.global",
      ...(modules["node-nlp"] ? ["nodeNlp.commonJS"] : []),
      "rxjs.commonJS",
      "rxjs.global",
      "tween.commonJS",
      "tween.global",
      "os.commonJS",
      "childProcess.noop",
      "native.steamFallback",
      "native.greenworksFallback",
    ]),
    entryId: config.entryId,
    fs: fsModule,
    path: pathModule,
    crypto: cryptoModule,
    process: processModule,
    Buffer: BrowserBuffer,
    nw: nwModule,
    electron: electronModule,
    os: osModule,
    window: windowShim,
    clipboard: clipboardShim,
    require: requireBridge,
  });

  function installRpgMakerLoadGameAliasRescue() {
    if (typeof window._Data_Manager_loadGame === "function") return;
    Object.defineProperty(window, "_Data_Manager_loadGame", {
      configurable: true,
      writable: true,
      value: function MzPlayerLoadGameAliasRescue(savefileId) {
        const manager =
          this && typeof this.loadGameWithoutRescue === "function"
            ? this
            : window.DataManager;
        if (manager && typeof manager.loadGameWithoutRescue === "function") {
          try {
            return manager.loadGameWithoutRescue(savefileId);
          } catch (error) {
            console.error(error);
            return false;
          }
        }
        console.warn(
          "[Local Web Game Player RPG Maker rescue] _Data_Manager_loadGame was called before DataManager.loadGameWithoutRescue existed.",
        );
        return false;
      },
    });
  }

  installRpgMakerLoadGameAliasRescue();

  console.info("[Local Web Game Player desktop API]", {
    entryId: config.entryId,
    modules: Object.keys(modules),
  });
})();
