// @ts-nocheck
import { createCryptoRuntime } from "./desktop/crypto";
import { EventEmitter } from "events";
import * as streamModule from "stream";
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

    function addSystemWindowFallbacks(stem) {
      const index = stem.lastIndexOf("/");
      const directory = index < 0 ? "" : stem.slice(0, index);
      const filename = index < 0 ? stem : stem.slice(index + 1);
      const lowerDirectory = directory.toLowerCase();
      if (
        filename.toLowerCase() !== "systemwindow" ||
        (lowerDirectory !== "img/system" && !lowerDirectory.endsWith("/img/system"))
      ) {
        return;
      }
      const fallbackStem = (directory ? directory + "/" : "") + "Window";
      add(fallbackStem + ".rpgmvp");
      for (const suffix of encryptedImageSuffixes) add(fallbackStem + suffix);
      for (const extension of plainImageExtensions) add(fallbackStem + extension);
    }

    for (const imageExtension of plainImageExtensions) {
      if (!lowerPath.endsWith(imageExtension)) continue;
      const stem = path.slice(0, -imageExtension.length);
      add(stem + ".rpgmvp");
      if (imageExtension === ".png") {
        for (const encryptedSuffix of encryptedImageSuffixes) add(stem + encryptedSuffix);
      }
      addSystemWindowFallbacks(stem);
      return candidates;
    }

    if (lowerPath.endsWith(".rpgmvp")) {
      const stem = path.slice(0, -".rpgmvp".length);
      for (const encryptedSuffix of encryptedImageSuffixes) add(pathWithExtension(path, encryptedSuffix));
      for (const imageExtension of plainImageExtensions) add(pathWithExtension(path, imageExtension));
      addSystemWindowFallbacks(stem);
      return candidates;
    }

    for (const encryptedSuffix of encryptedImageSuffixes) {
      if (!lowerPath.endsWith(encryptedSuffix)) continue;
      const stem = path.slice(0, -encryptedSuffix.length);
      add(stem + ".rpgmvp");
      for (const candidateSuffix of encryptedImageSuffixes) add(stem + candidateSuffix);
      for (const imageExtension of plainImageExtensions) add(stem + imageExtension);
      addSystemWindowFallbacks(stem);
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

  const { clipboardShim, electronModule, nwGuiModule, nwModule, windowShim } = createNwRuntime();

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
  const hardwareConcurrency = Math.max(1, Number(window.navigator?.hardwareConcurrency) || 1);
  const approximateMemory = Math.max(1, Number(window.navigator?.deviceMemory) || 4) * 1024 ** 3;
  const osModule = {
    EOL: processModule.platform === "win32" ? "\r\n" : "\n",
    constants: Object.freeze({ errno: {}, signals: {} }),
    arch: () => processModule.arch || "x64",
    availableParallelism: () => hardwareConcurrency,
    cpus: () => Array.from({ length: hardwareConcurrency }, (_, index) => ({
      model: "Browser CPU " + (index + 1),
      speed: 0,
      times: { idle: 0, irq: 0, nice: 0, sys: 0, user: 0 },
    })),
    endianness: () => "LE",
    freemem: () => Math.floor(approximateMemory / 2),
    homedir: () => "/home/web-user",
    hostname: () => "browser-player",
    loadavg: () => [0, 0, 0],
    machine: () => processModule.arch || "x64",
    networkInterfaces: () => ({}),
    platform: () => processModule.platform || "browser",
    release: () => "",
    tmpdir: () => "/tmp",
    totalmem: () => approximateMemory,
    type: () => processModule.platform === "win32" ? "Windows_NT" : "Browser",
    userInfo: () => ({
      gid: -1,
      homedir: "/home/web-user",
      shell: null,
      uid: -1,
      username: "web-user",
    }),
    version: () => "Browser",
  };
  const noop = () => undefined;
  function createChildProcess() {
    const child = new EventEmitter();
    const createPipe = () => {
      const pipe = new EventEmitter();
      pipe.readable = true;
      pipe.writable = true;
      pipe.write = () => true;
      pipe.end = () => pipe.emit("finish");
      pipe.destroy = noop;
      pipe.setEncoding = () => pipe;
      pipe.pipe = () => pipe;
      return pipe;
    };
    child.pid = 0;
    child.killed = false;
    child.connected = false;
    child.stdin = createPipe();
    child.stdout = createPipe();
    child.stderr = createPipe();
    child.kill = () => {
      child.killed = true;
      return true;
    };
    child.disconnect = noop;
    child.ref = () => child;
    child.send = (_message, callback) => {
      if (typeof callback === "function") queueMicrotask(() => callback(null));
      return false;
    };
    child.unref = () => child;
    queueMicrotask(() => {
      child.emit("spawn");
      child.emit("exit", 0, null);
      child.emit("close", 0, null);
    });
    return child;
  }

  function noopOutput(options) {
    const encoding = typeof options === "string" ? options : options?.encoding;
    return encoding && encoding !== "buffer" ? "" : BrowserBuffer.alloc(0);
  }

  const childProcessModule = {
    exec(_command, options, callback) {
      const done = typeof options === "function" ? options : callback;
      const child = createChildProcess();
      Promise.resolve().then(() => {
        if (typeof done === "function") done(null, "", "");
      });
      return child;
    },
    execFile(_file, args, options, callback) {
      if (typeof args === "function") return this.exec("", args);
      if (typeof options === "function") return this.exec("", options);
      return this.exec("", options, callback);
    },
    execFileSync(_file, args, options) {
      return noopOutput(Array.isArray(args) ? options : args);
    },
    execSync(_command, options) {
      return noopOutput(options);
    },
    fork: () => createChildProcess(),
    spawn: () => createChildProcess(),
    spawnSync(_command, args, options) {
      const output = noopOutput(Array.isArray(args) ? options : args);
      return { error: undefined, output: [null, output, output], pid: 0, signal: null, status: 0, stderr: output, stdout: output };
    },
  };
  const commonJsModuleCache = new Map();
  const commonJsRequireCache = Object.create(null);
  const mainModule = {
    children: [],
    exports: {},
    filename: "/www/index.html",
    id: ".",
    loaded: true,
    parent: null,
    paths: ["/www/node_modules", "/node_modules"],
  };
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
  const greenworksNativeFallback = {
    FriendFlags: Object.freeze({ All: 65535, Immediate: 4 }),
    activateAchievement: () => false,
    activateGameOverlay: () => false,
    activateGameOverlayToWebPage: () => false,
    clearAchievement: () => false,
    getAchievement: () => false,
    getCurrentGameLanguage: () => "english",
    getCurrentUILanguage: () => "english",
    getDLCCount: () => 0,
    getFriendCount: () => 0,
    getNumberOfAchievements: () => 0,
    getStatFloat: () => 0,
    getStatInt: () => 0,
    getSteamId: () => ({ screenName: "Player", steamId: "0" }),
    initAPI: () => false,
    installDLC: () => false,
    isCloudEnabled: () => false,
    isCloudEnabledForUser: () => false,
    isDLCInstalled: () => false,
    isGameOverlayEnabled: () => false,
    isSteamRunning: () => false,
    isSubscribedApp: () => false,
    setStat: () => false,
    storeStats: () => false,
    uninstallDLC: () => false,
  };

  const utilModule = {
    callbackify(fn) {
      return function callbackified() {
        const args = Array.from(arguments);
        const callback = args.pop();
        Promise.resolve(fn.apply(this, args)).then(
          (value) => callback(null, value),
          (error) => callback(error),
        );
      };
    },
    format(format) {
      if (typeof format !== "string") return Array.from(arguments).map(String).join(" ");
      const values = Array.prototype.slice.call(arguments, 1);
      let index = 0;
      const output = format.replace(/%[sdijo%]/gu, (token) => {
        if (token === "%%") return "%";
        if (index >= values.length) return token;
        const value = values[index++];
        if (token === "%d" || token === "%i") return String(Number(value));
        if (token === "%j" || token === "%o") {
          try { return JSON.stringify(value); } catch { return "[Circular]"; }
        }
        return String(value);
      });
      return [output, ...values.slice(index).map(String)].join(" ");
    },
    inherits(constructor, superConstructor) {
      if (typeof constructor !== "function" || typeof superConstructor !== "function") return;
      Object.setPrototypeOf(constructor.prototype, superConstructor.prototype);
      Object.setPrototypeOf(constructor, superConstructor);
      constructor.super_ = superConstructor;
    },
    inspect(value) {
      if (typeof value === "string") return value;
      try { return JSON.stringify(value); } catch { return String(value); }
    },
    promisify(fn) {
      return function promisified() {
        const args = Array.from(arguments);
        return new Promise((resolve, reject) => {
          fn.apply(this, args.concat((error, value) => error ? reject(error) : resolve(value)));
        });
      };
    },
    types: {
      isAnyArrayBuffer: (value) => value instanceof ArrayBuffer,
      isArrayBufferView: (value) => ArrayBuffer.isView(value),
      isDate: (value) => value instanceof Date,
      isNativeError: (value) => value instanceof Error,
      isPromise: (value) => Boolean(value && typeof value.then === "function"),
      isRegExp: (value) => value instanceof RegExp,
      isTypedArray: (value) => ArrayBuffer.isView(value) && !(value instanceof DataView),
    },
  };

  function assertionError(actual, expected, message, operator) {
    const error = new Error(message || "Assertion failed: " + operator);
    error.name = "AssertionError";
    error.code = "ERR_ASSERTION";
    error.actual = actual;
    error.expected = expected;
    error.operator = operator;
    return error;
  }

  function assertModule(value, message) {
    if (!value) throw assertionError(value, true, message, "==");
  }
  assertModule.ok = assertModule;
  assertModule.equal = (actual, expected, message) => {
    if (actual != expected) throw assertionError(actual, expected, message, "==");
  };
  assertModule.strictEqual = (actual, expected, message) => {
    if (actual !== expected) throw assertionError(actual, expected, message, "strictEqual");
  };
  assertModule.notStrictEqual = (actual, expected, message) => {
    if (actual === expected) throw assertionError(actual, expected, message, "notStrictEqual");
  };
  assertModule.deepStrictEqual = (actual, expected, message) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw assertionError(actual, expected, message, "deepStrictEqual");
    }
  };
  assertModule.fail = (message) => { throw assertionError(undefined, undefined, message, "fail"); };

  const querystringModule = {
    escape: encodeURIComponent,
    unescape: decodeURIComponent,
    stringify(value) {
      const params = new URLSearchParams();
      for (const [key, entry] of Object.entries(value || {})) {
        for (const item of Array.isArray(entry) ? entry : [entry]) params.append(key, String(item ?? ""));
      }
      return params.toString();
    },
    parse(value) {
      const output = Object.create(null);
      for (const [key, entry] of new URLSearchParams(String(value ?? ""))) {
        if (output[key] === undefined) output[key] = entry;
        else output[key] = Array.isArray(output[key]) ? output[key].concat(entry) : [output[key], entry];
      }
      return output;
    },
  };

  const urlModule = {
    URL: window.URL || URL,
    URLSearchParams: window.URLSearchParams || URLSearchParams,
    domainToASCII: (value) => String(value ?? ""),
    domainToUnicode: (value) => String(value ?? ""),
    fileURLToPath(value) {
      const url = value instanceof URL ? value : new URL(String(value));
      if (url.protocol !== "file:") throw new TypeError("URL must use the file: protocol.");
      return decodeURIComponent(url.pathname);
    },
    pathToFileURL(value) {
      const path = String(value ?? "").replace(/\\+/g, "/");
      return new URL("file://" + (path.startsWith("/") ? "" : "/") + path.split("/").map(encodeURIComponent).join("/"));
    },
    parse(value, parseQueryString) {
      const parsed = new URL(String(value), window.location.href || window.location.origin);
      return {
        auth: parsed.username ? parsed.username + (parsed.password ? ":" + parsed.password : "") : null,
        hash: parsed.hash,
        host: parsed.host,
        hostname: parsed.hostname,
        href: parsed.href,
        path: parsed.pathname + parsed.search,
        pathname: parsed.pathname,
        port: parsed.port,
        protocol: parsed.protocol,
        query: parseQueryString ? querystringModule.parse(parsed.search.slice(1)) : parsed.search.slice(1),
        search: parsed.search,
        slashes: true,
      };
    },
  };

  const timersModule = {
    clearImmediate: window.clearImmediate || window.clearTimeout.bind(window),
    clearInterval: window.clearInterval.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setImmediate: window.setImmediate || ((callback, ...args) => window.setTimeout(callback, 0, ...args)),
    setInterval: window.setInterval.bind(window),
    setTimeout: window.setTimeout.bind(window),
  };

  const modules = {
    path: pathModule,
    "node:path": pathModule,
    fs: fsModule,
    "node:fs": fsModule,
    "nw.gui": nwGuiModule,
    nw: nwModule,
    electron: electronModule,
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
    assert: assertModule,
    "node:assert": assertModule,
    querystring: querystringModule,
    "node:querystring": querystringModule,
    stream: streamModule,
    "node:stream": streamModule,
    timers: timersModule,
    "node:timers": timersModule,
    url: urlModule,
    "node:url": urlModule,
    util: utilModule,
    "node:util": utilModule,
  };

  class StringDecoderShim {
    constructor(encoding = "utf8") {
      this.encoding = String(encoding).toLowerCase().replace(/[-_]/gu, "");
      const decoderEncoding = this.encoding === "utf16le" || this.encoding === "ucs2"
        ? "utf-16le"
        : this.encoding === "latin1" || this.encoding === "binary"
          ? "windows-1252"
          : "utf-8";
      this.decoder = new TextDecoder(decoderEncoding);
    }
    write(value) {
      const bytes = ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : new Uint8Array(value);
      return this.decoder.decode(bytes, { stream: true });
    }
    end(value) {
      return (value === undefined ? "" : this.write(value)) + this.decoder.decode();
    }
  }
  const stringDecoderModule = { StringDecoder: StringDecoderShim };
  modules.string_decoder = stringDecoderModule;
  modules["node:string_decoder"] = stringDecoderModule;
  modules.constants = fsModule.constants;
  modules["node:constants"] = fsModule.constants;
  const ttyModule = { isatty: () => false };
  modules.tty = ttyModule;
  modules["node:tty"] = ttyModule;

  const moduleModule = {
    builtinModules: Object.keys(modules).filter((name) => !name.startsWith("node:")),
    createRequire(filename) {
      const parentFilename = filename instanceof URL
        ? urlModule.fileURLToPath(filename)
        : String(filename || mainModule.filename);
      const createdRequire = (request) => mzPlayerRequire(request, parentFilename);
      createdRequire.cache = commonJsRequireCache;
      createdRequire.main = mainModule;
      createdRequire.resolve = (request) => mzPlayerRequire.resolve(request, parentFilename);
      return createdRequire;
    },
    isBuiltin(name) {
      return Object.prototype.hasOwnProperty.call(modules, String(name));
    },
  };
  modules.module = moduleModule;
  modules["node:module"] = moduleModule;
  moduleModule.builtinModules.push("module");

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

  function isGreenworksNativeModule(name) {
    const normalized = String(name)
      .replace(/\\+/g, "/")
      .replace(/\.(?:js|node)$/iu, "")
      .toLowerCase();
    const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
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
    if (isGreenworksNativeModule(key)) {
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
