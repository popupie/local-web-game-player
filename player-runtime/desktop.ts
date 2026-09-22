// @ts-nocheck
import { createCryptoRuntime } from "./desktop/crypto";
import { EventEmitter } from "events";
import { createFsRuntime } from "./desktop/fs";
import { createNwRuntime } from "./desktop/nw";
import { createProcessRuntime } from "./desktop/process";
import { createPathRuntime } from "./desktop/path";

(() => {
  const config = window.__MZ_PLAYER_DESKTOP_CONFIG;
  if (!config || typeof config !== "object") {
    throw new Error("Local Web Game Player desktop runtime config did not load.");
  }
  const manifestUrlByRawReference = new Map();

  function addRawAssetReference(reference, url, priority = 1) {
    if (!reference) return;
    const existing = manifestUrlByRawReference.get(reference);
    if (existing && existing.priority <= priority) return;
    manifestUrlByRawReference.set(reference, { priority, url });
  }

  function addAssetReferenceVariants(reference, url, priority = 1) {
    addRawAssetReference(reference, url, priority);
    addRawAssetReference("./" + reference, url, priority);
    addRawAssetReference("/" + reference.replace(/^\/+/, ""), url, priority);
  }

  function addFileRouteReference(reference, url, priority = 1) {
    addRawAssetReference(
      config.fileRoutePrefix + reference.replace(/^\/+/, ""),
      url,
      priority,
    );
  }

  function encodedFileRouteUrl(path) {
    return (
      config.fileRoutePrefix +
      String(path)
        .replace(/\\+/g, "/")
        .replace(/^\/+/, "")
        .split("/")
        .map(encodeURIComponent)
        .join("/")
    );
  }

  function pathWithExtension(path, extension) {
    const index = path.lastIndexOf(".");
    if (index < 0) return null;
    return path.slice(0, index) + extension;
  }

  function suffixedPathCandidates(path) {
    return [path + "_", path + "__", path + "___"];
  }

  function pathWithoutSuffixMarkers(path) {
    return path.replace(/_+$/u, "");
  }

  const plainImageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
  const encryptedImageSuffixes = [".png_", ".png__", ".png___"];
  const plainAudioExtensions = [".ogg", ".m4a", ".mp3", ".wav", ".oga"];
  const encryptedAudioExtensions = [".rpgmvo", ".rpgmvm"];
  const plainVideoExtensions = [".webm", ".mp4"];

  function rpgMakerAssetReferenceAliases(path) {
    const lowerPath = path.toLowerCase();
    const unsuffixedPath = pathWithoutSuffixMarkers(path);
    const lowerUnsuffixedPath = unsuffixedPath.toLowerCase();
    const candidates = [];

    function add(candidate) {
      if (candidate && candidate !== path && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }

    for (const imageExtension of plainImageExtensions) {
      if (!lowerPath.endsWith(imageExtension)) continue;
      const stem = path.slice(0, -imageExtension.length);
      add(stem + ".rpgmvp");
      if (imageExtension === ".png") {
        for (const encryptedSuffix of encryptedImageSuffixes) add(stem + encryptedSuffix);
      }
      return candidates;
    }

    if (lowerPath.endsWith(".rpgmvp")) {
      for (const encryptedSuffix of encryptedImageSuffixes) add(pathWithExtension(path, encryptedSuffix));
      for (const imageExtension of plainImageExtensions) add(pathWithExtension(path, imageExtension));
      return candidates;
    }

    for (const encryptedSuffix of encryptedImageSuffixes) {
      if (!lowerPath.endsWith(encryptedSuffix)) continue;
      const stem = path.slice(0, -encryptedSuffix.length);
      add(stem + ".rpgmvp");
      for (const candidateSuffix of encryptedImageSuffixes) add(stem + candidateSuffix);
      for (const imageExtension of plainImageExtensions) add(stem + imageExtension);
      return candidates;
    }

    if (plainAudioExtensions.some((extension) => lowerUnsuffixedPath.endsWith(extension))) {
      add(unsuffixedPath);
      for (const candidate of suffixedPathCandidates(unsuffixedPath)) add(candidate);
      for (const encryptedExtension of encryptedAudioExtensions) {
        const encryptedPath = pathWithExtension(unsuffixedPath, encryptedExtension);
        add(encryptedPath);
        if (encryptedPath) {
          for (const candidate of suffixedPathCandidates(encryptedPath)) add(candidate);
        }
      }
      return candidates;
    }

    if (encryptedAudioExtensions.some((extension) => lowerUnsuffixedPath.endsWith(extension))) {
      add(unsuffixedPath);
      for (const candidate of suffixedPathCandidates(unsuffixedPath)) add(candidate);
      for (const plainExtension of plainAudioExtensions) {
        const plainPath = pathWithExtension(unsuffixedPath, plainExtension);
        add(plainPath);
        if (plainPath) {
          for (const candidate of suffixedPathCandidates(plainPath)) add(candidate);
        }
      }
      return candidates;
    }

    if (plainVideoExtensions.some((extension) => lowerUnsuffixedPath.endsWith(extension))) {
      add(unsuffixedPath);
      for (const candidate of suffixedPathCandidates(unsuffixedPath)) add(candidate);
      for (const videoExtension of plainVideoExtensions) {
        const videoPath = pathWithExtension(unsuffixedPath, videoExtension);
        add(videoPath);
        if (videoPath) {
          for (const candidate of suffixedPathCandidates(videoPath)) {
            add(candidate);
          }
        }
      }
      return candidates;
    }

    return candidates;
  }

  function manifestPathAliases(path) {
    const rawPath = String(path).replace(/\\+/g, "/").replace(/^\/+/, "");
    const aliases = new Set([rawPath]);
    if (rawPath.toLowerCase().startsWith("www/")) {
      aliases.add(rawPath.slice(4));
    }
    return { aliases, rawPath };
  }

  for (const file of config.files) {
    const { aliases, rawPath } = manifestPathAliases(file.path);
    for (const alias of aliases) {
      addAssetReferenceVariants(alias, file.url, 0);
      addFileRouteReference(alias, file.url, 0);
    }

    addRawAssetReference(config.fileRoutePrefix + rawPath, file.url, 0);
  }

  for (const file of config.files) {
    const { aliases } = manifestPathAliases(file.path);

    for (const alias of aliases) {
      for (const assetAlias of rpgMakerAssetReferenceAliases(alias)) {
        const assetAliasUrl = encodedFileRouteUrl(assetAlias);
        addAssetReferenceVariants(assetAlias, assetAliasUrl, 1);
        addFileRouteReference(assetAlias, assetAliasUrl, 1);
      }
    }
  }

  function sanitizeMalformedPercentUrl(value) {
    if (typeof value !== "string") return value;
    return value.replace(/%(?![0-9A-Fa-f]{2})/g, "%25");
  }

  function canonicalManifestAssetUrl(value) {
    if (typeof value !== "string") return value;

    const origin = window.location.origin;
    const isSameOriginAbsolute = value.startsWith(origin + "/");
    const reference = isSameOriginAbsolute ? value.slice(origin.length) : value;
    const canonical = manifestUrlByRawReference.get(reference)?.url;
    if (!canonical) return value;
    return isSameOriginAbsolute ? origin + canonical : canonical;
  }

  function exactManifestAssetEntry(value) {
    if (typeof value !== "string") return null;
    const origin = window.location.origin;
    const reference = value.startsWith(origin + "/")
      ? value.slice(origin.length)
      : value;
    const baseReference = reference.split("?")[0].split("#")[0];
    return [reference, baseReference]
      .map((candidate) => manifestUrlByRawReference.get(candidate))
      .find((entry) => entry?.priority === 0) ?? null;
  }

  function shouldBypassEncryptedExtensionRewrite(value) {
    if (typeof value !== "string") return false;
    const path = value.split("?")[0].split("#")[0].toLowerCase();
    if (
      !path.endsWith(".png") &&
      !path.endsWith(".ogg") &&
      !path.endsWith(".m4a")
    ) {
      return false;
    }
    return exactManifestAssetEntry(value) !== null;
  }

  function bytesFromBuffer(value) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return null;
  }

  function imageMimeType(value) {
    const bytes = bytesFromBuffer(value);
    if (!bytes || bytes.length < 12) return null;
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return "image/png";
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38
    ) {
      return "image/gif";
    }
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
    return null;
  }

  function sanitizePlayerUrl(value) {
    return sanitizeMalformedPercentUrl(canonicalManifestAssetUrl(value));
  }

  function sanitizeRequestInput(input) {
    if (typeof input === "string") {
      return sanitizePlayerUrl(input);
    }
    if (typeof URL !== "undefined" && input instanceof URL) {
      const sanitized = sanitizePlayerUrl(input.href);
      return sanitized === input.href ? input : new URL(sanitized, input.href);
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
      const sanitized = sanitizePlayerUrl(input.url);
      if (sanitized === input.url || input.bodyUsed) return input;
      try {
        return new Request(sanitized, input);
      } catch {
        return input;
      }
    }
    return input;
  }

  function installPlayerUrlPatch() {
    if (window.__mzPlayerUrlPatch) return;
    Object.defineProperty(window, "__mzPlayerUrlPatch", {
      value: true,
      configurable: false,
    });

    if (typeof XMLHttpRequest !== "undefined") {
      const open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        return open.apply(this, [method, sanitizeRequestInput(url)].concat(
          Array.prototype.slice.call(arguments, 2),
        ));
      };
    }

    if (typeof window.fetch === "function") {
      const fetch = window.fetch.bind(window);
      window.fetch = function(input, init) {
        return fetch(sanitizeRequestInput(input), init);
      };
    }

    function patchSrcSetter(prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "src");
      if (!descriptor || typeof descriptor.set !== "function") return;
      Object.defineProperty(prototype, "src", {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value) {
          descriptor.set.call(this, sanitizePlayerUrl(String(value)));
        },
      });
    }

    if (typeof HTMLImageElement !== "undefined") {
      patchSrcSetter(HTMLImageElement.prototype);
    }
    if (typeof HTMLMediaElement !== "undefined") {
      patchSrcSetter(HTMLMediaElement.prototype);
    }
    if (typeof Element !== "undefined") {
      const setAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function(name, value) {
        if (
          typeof name === "string" &&
          name.toLowerCase() === "src" &&
          (
            (
              typeof HTMLImageElement !== "undefined" &&
              this instanceof HTMLImageElement
            ) ||
            (
              typeof HTMLMediaElement !== "undefined" &&
              this instanceof HTMLMediaElement
            ) ||
            (
              typeof HTMLSourceElement !== "undefined" &&
              this instanceof HTMLSourceElement
            )
          )
        ) {
          return setAttribute.call(this, name, sanitizePlayerUrl(String(value)));
        }
        return setAttribute.apply(this, arguments);
      };
    }
  }

  function installRpgMakerBrowserCompatibilityShim() {
    const fallbackColor = "#ffffff";

    if (!Object.prototype.hasOwnProperty.call(window, "追加")) {
      try {
        Object.defineProperty(window, "追加", {
          configurable: true,
          writable: true,
          value: undefined,
        });
      } catch {
        window.追加 = undefined;
      }
    }

    function finiteInteger(value, fallback) {
      const number = Number(value);
      if (!Number.isFinite(number)) return fallback;
      return Math.trunc(number);
    }

    function patchTextColor() {
      const windowBase = window.Window_Base;
      const prototype = windowBase && windowBase.prototype;
      if (!prototype || typeof prototype.textColor !== "function") return;
      if (prototype.textColor.__MzPlayerRpgMakerBrowserCompat) return;

      const textColor = prototype.textColor;
      const wrappedTextColor = function(n) {
        return textColor.call(this, finiteInteger(n, 0));
      };
      Object.defineProperty(wrappedTextColor, "__MzPlayerRpgMakerBrowserCompat", {
        value: true,
      });
      prototype.textColor = wrappedTextColor;
    }

    function patchBitmapGetPixel() {
      const bitmap = window.Bitmap;
      const prototype = bitmap && bitmap.prototype;
      if (!prototype || typeof prototype.getPixel !== "function") return;
      if (prototype.getPixel.__MzPlayerRpgMakerBrowserCompat) return;

      const getPixel = prototype.getPixel;
      const wrappedGetPixel = function(x, y) {
        const numberX = Number(x);
        const numberY = Number(y);
        if (!Number.isFinite(numberX) || !Number.isFinite(numberY)) {
          return fallbackColor;
        }

        try {
          return getPixel.call(this, Math.trunc(numberX), Math.trunc(numberY));
        } catch (error) {
          if (
            error instanceof TypeError &&
            String(error.message || "").includes("long")
          ) {
            return fallbackColor;
          }
          throw error;
        }
      };
      Object.defineProperty(wrappedGetPixel, "__MzPlayerRpgMakerBrowserCompat", {
        value: true,
      });
      prototype.getPixel = wrappedGetPixel;
    }

    let attempts = 0;
    const patch = () => {
      attempts += 1;
      patchTextColor();
      patchBitmapGetPixel();
      if (attempts > 600) window.clearInterval(timer);
    };
    const timer = window.setInterval(patch, 100);
    patch();
  }

  function installRpgMakerEncryptedExtensionBypass() {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const decrypter = window.Decrypter;
      if (decrypter && !decrypter.__MzPlayerEncryptedExtensionBypass) {
        Object.defineProperty(decrypter, "__MzPlayerEncryptedExtensionBypass", {
          value: true,
        });
        if (typeof decrypter.extToEncryptExt === "function") {
          const extToEncryptExt = decrypter.extToEncryptExt;
          decrypter.extToEncryptExt = function(url) {
            if (shouldBypassEncryptedExtensionRewrite(url)) return url;
            return extToEncryptExt.apply(this, arguments);
          };
        }
        if (typeof decrypter.decryptArrayBuffer === "function") {
          const decryptArrayBuffer = decrypter.decryptArrayBuffer;
          decrypter.decryptArrayBuffer = function(arrayBuffer) {
            const originalMimeType = imageMimeType(arrayBuffer);
            try {
              const result = decryptArrayBuffer.apply(this, arguments);
              if (originalMimeType && !imageMimeType(result)) {
                return arrayBuffer;
              }
              return result;
            } catch (error) {
              if (originalMimeType) return arrayBuffer;
              throw error;
            }
          };
        }
        if (typeof decrypter.createBlobUrl === "function") {
          const createBlobUrl = decrypter.createBlobUrl;
          decrypter.createBlobUrl = function(arrayBuffer) {
            const mimeType = imageMimeType(arrayBuffer);
            if (
              mimeType &&
              typeof Blob !== "undefined" &&
              window.URL &&
              typeof window.URL.createObjectURL === "function"
            ) {
              return window.URL.createObjectURL(
                new Blob([arrayBuffer], { type: mimeType }),
              );
            }
            return createBlobUrl.apply(this, arguments);
          };
        }
        window.clearInterval(timer);
      }
      if (attempts > 300) window.clearInterval(timer);
    }, 100);
  }

  installRpgMakerBrowserCompatibilityShim();
  installRpgMakerEncryptedExtensionBypass();
  installPlayerUrlPatch();

  function isMzPlayerRequireResolutionError(error) {
    return (
      error instanceof Error &&
      (
        error.message.startsWith(
          "Local Web Game Player cannot provide Node module:",
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

  const pathRuntime = createPathRuntime(config);
  const {
    dirname,
    extname,
    joinPath,
    lookupManifestFile,
    manifestKey,
    normalizePath,
    pathModule,
  } = pathRuntime;

  const { clipboardShim, nwGuiModule, nwModule, windowShim } = createNwRuntime();

  function bytesToHex(bytes) {
    let output = "";
    for (const byte of bytes) {
      output += byte.toString(16).padStart(2, "0");
    }
    return output;
  }

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
    bytesToHex,
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
  const osModule = {
    EOL: processModule.platform === "win32" ? "\r\n" : "\n",
    arch: () => processModule.arch || "x64",
    endianness: () => "LE",
    homedir: () => "/home/web-user",
    hostname: () => "browser-player",
    platform: () => processModule.platform || "browser",
    release: () => "",
    tmpdir: () => "/tmp",
    type: () => processModule.platform === "win32" ? "Windows_NT" : "Browser",
  };
  const childProcessModule = {
    exec(_command, options, callback) {
      const done = typeof options === "function" ? options : callback;
      const child = new EventEmitter();
      child.pid = 0;
      child.killed = false;
      child.kill = () => {
        child.killed = true;
        return true;
      };
      Promise.resolve().then(() => {
        if (typeof done === "function") done(null, "", "");
        child.emit("exit", 0, null);
        child.emit("close", 0, null);
      });
      return child;
    },
  };
  const commonJsModuleCache = new Map();
  const steamNativeFallback = {
    _steam_events: { on() {} },
    initAPI: () => false,
    getSteamId: () => null,
    getCloudQuota(success) {
      if (typeof success === "function") success(0, 0);
    },
    getNumberOfAchievements: () => 0,
    getAchievementNames: () => [],
    getCurrentGameLanguage: () => "english",
    getCurrentUILanguage: () => "english",
    GetAppID: () => 0,
    isGameOverlayEnabled: () => false,
    isCloudEnabled: () => false,
    isCloudEnabledForUser: () => false,
    IsBPMode: () => false,
  };

  const modules = {
    path: pathModule,
    fs: fsModule,
    "nw.gui": nwGuiModule,
    nw: nwModule,
    crypto: cryptoModule,
    "node:crypto": cryptoModule,
    process: processModule,
    "node:process": processModule,
    buffer: bufferModule,
    "node:buffer": bufferModule,
    events: { EventEmitter },
    "node:events": { EventEmitter },
    os: osModule,
    "node:os": osModule,
    child_process: childProcessModule,
    "node:child_process": childProcessModule,
  };

  function isSteamNativeModule(name) {
    return /(?:^|\/)Steam4C2-(?:win|linux|osx)(?:32|64)$/iu.test(
      String(name).replace(/\\+/g, "/").replace(/\.node$/iu, ""),
    );
  }

  function isSteam4C2BridgeModule(name) {
    return /(?:^|\/)Steam4C2$/iu.test(
      String(name).replace(/\\+/g, "/").replace(/\.js$/iu, ""),
    );
  }

  function resolvePackagedModule(name, parentFilename) {
    const request = String(name).replace(/\\+/g, "/");
    let candidate;
    if (request.startsWith("/")) {
      candidate = normalizePath(request);
    } else if (request.startsWith("./") || request.startsWith("../")) {
      candidate = normalizePath(joinPath(dirname(parentFilename), request));
    } else {
      candidate = normalizePath(request);
    }

    const candidates = [candidate];
    if (!extname(candidate)) {
      candidates.push(candidate + ".js", candidate + ".json");
      candidates.push(joinPath(candidate, "index.js"), joinPath(candidate, "index.json"));
    }
    for (const path of candidates) {
      const file = lookupManifestFile(path);
      if (file) return file;
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
      exports: {},
      filename,
      id: filename,
      loaded: false,
    };
    commonJsModuleCache.set(cacheKey, module);

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
      throw error;
    }
  }

  function mzPlayerRequire(name, parentFilename = "/www/index.html") {
    const key = String(name);
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
    throw new Error("Local Web Game Player cannot provide Node module: " + key);
  }

  const requireBridge = installGlobalRequireBridge(mzPlayerRequire);
  nwModule.require = requireBridge;
  nwGuiModule.require = requireBridge;

  window.MzPlayerDesktop = Object.freeze({
    version: 1,
    capabilities: Object.freeze([
      "fs.virtualSync",
      "fs.manifestRead",
      "fs.manifestSyncRead",
      "fs.manifestMetadata",
      "path.posix",
      "nw.gui.noop",
      "nw.windowOpen.currentFrame",
      "nw.globalNoop",
      "crypto.webRandom",
      "crypto.nodeCiphers",
      "process.browserCompat",
      "modules.manifestCommonJS",
      "buffer.commonJS",
      "buffer.global",
      "events.commonJS",
      "os.commonJS",
      "childProcess.noop",
      "native.steamFallback",
    ]),
    entryId: config.entryId,
    fs: fsModule,
    path: pathModule,
    crypto: cryptoModule,
    process: processModule,
    Buffer: BrowserBuffer,
    nw: nwModule,
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
