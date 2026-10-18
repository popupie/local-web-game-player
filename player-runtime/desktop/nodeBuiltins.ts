// @ts-nocheck

import { EventEmitter } from "events";
import * as tweenModule from "@tweenjs/tween.js";
import lodashModule from "lodash";
import * as rxjsModule from "rxjs";
import * as rxjsAjaxModule from "rxjs/ajax";
import * as rxjsFetchModule from "rxjs/fetch";
import * as rxjsOperatorsModule from "rxjs/operators";
import * as rxjsTestingModule from "rxjs/testing";
import * as rxjsWebSocketModule from "rxjs/webSocket";
import * as streamModule from "stream";
import * as xlsxModule from "xlsx";
import { scheduleMicrotask } from "@/shared/browser";

export function createNodeBuiltins({
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
}) {
  const hardwareConcurrency = Math.max(
    1,
    Number(window.navigator?.hardwareConcurrency) || 1,
  );
  const approximateMemory =
    Math.max(1, Number(window.navigator?.deviceMemory) || 4) * 1024 ** 3;
  const osModule = {
    EOL: processModule.platform === "win32" ? "\r\n" : "\n",
    constants: Object.freeze({ errno: {}, signals: {} }),
    arch: () => processModule.arch || "x64",
    availableParallelism: () => hardwareConcurrency,
    cpus: () =>
      Array.from({ length: hardwareConcurrency }, (_, index) => ({
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
    type: () => (processModule.platform === "win32" ? "Windows_NT" : "Browser"),
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
      if (typeof callback === "function") scheduleMicrotask(() => callback(null));
      return false;
    };
    child.unref = () => child;
    scheduleMicrotask(() => {
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
      return {
        error: undefined,
        output: [null, output, output],
        pid: 0,
        signal: null,
        status: 0,
        stderr: output,
        stdout: output,
      };
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
    ...steamNativeFallback,
    FriendFlags: Object.freeze({ All: 65535, Immediate: 4 }),
    activateAchievement: () => false,
    activateGameOverlay: () => false,
    activateGameOverlayToWebPage: () => false,
    clearAchievement: () => false,
    getAchievement: () => false,
    getDLCCount: () => 0,
    getFriendCount: () => 0,
    getStatFloat: () => 0,
    getStatInt: () => 0,
    getSteamId: () => ({ screenName: "Player", steamId: "0" }),
    installDLC: () => false,
    isDLCInstalled: () => false,
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
      if (typeof format !== "string") {
        return Array.from(arguments).map(String).join(" ");
      }
      const values = Array.prototype.slice.call(arguments, 1);
      let index = 0;
      const output = format.replace(/%[sdijo%]/gu, (token) => {
        if (token === "%%") return "%";
        if (index >= values.length) return token;
        const value = values[index++];
        if (token === "%d" || token === "%i") return String(Number(value));
        if (token === "%j" || token === "%o") {
          try {
            return JSON.stringify(value);
          } catch {
            return "[Circular]";
          }
        }
        return String(value);
      });
      return [output, ...values.slice(index).map(String)].join(" ");
    },
    inherits(constructor, superConstructor) {
      if (
        typeof constructor !== "function" ||
        typeof superConstructor !== "function"
      ) {
        return;
      }
      Object.setPrototypeOf(constructor.prototype, superConstructor.prototype);
      Object.setPrototypeOf(constructor, superConstructor);
      constructor.super_ = superConstructor;
    },
    inspect(value) {
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    },
    promisify(fn) {
      return function promisified() {
        const args = Array.from(arguments);
        return new Promise((resolve, reject) => {
          fn.apply(
            this,
            args.concat((error, value) => (error ? reject(error) : resolve(value))),
          );
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
      isTypedArray: (value) =>
        ArrayBuffer.isView(value) && !(value instanceof DataView),
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
    if (actual !== expected) {
      throw assertionError(actual, expected, message, "strictEqual");
    }
  };
  assertModule.notStrictEqual = (actual, expected, message) => {
    if (actual === expected) {
      throw assertionError(actual, expected, message, "notStrictEqual");
    }
  };
  assertModule.deepStrictEqual = (actual, expected, message) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw assertionError(actual, expected, message, "deepStrictEqual");
    }
  };
  assertModule.fail = (message) => {
    throw assertionError(undefined, undefined, message, "fail");
  };

  const querystringModule = {
    escape: encodeURIComponent,
    unescape: decodeURIComponent,
    stringify(value) {
      const params = new URLSearchParams();
      for (const [key, entry] of Object.entries(value || {})) {
        for (const item of Array.isArray(entry) ? entry : [entry]) {
          params.append(key, String(item ?? ""));
        }
      }
      return params.toString();
    },
    parse(value) {
      const output = Object.create(null);
      for (const [key, entry] of new URLSearchParams(String(value ?? ""))) {
        if (output[key] === undefined) output[key] = entry;
        else if (Array.isArray(output[key])) output[key] = output[key].concat(entry);
        else output[key] = [output[key], entry];
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
      if (url.protocol !== "file:") {
        throw new TypeError("URL must use the file: protocol.");
      }
      return decodeURIComponent(url.pathname);
    },
    pathToFileURL(value) {
      const path = String(value ?? "").replace(/\\+/g, "/");
      return new URL(
        "file://" +
          (path.startsWith("/") ? "" : "/") +
          path.split("/").map(encodeURIComponent).join("/"),
      );
    },
    parse(value, parseQueryString) {
      const parsed = new URL(
        String(value),
        window.location.href || window.location.origin,
      );
      return {
        auth: parsed.username
          ? parsed.username + (parsed.password ? ":" + parsed.password : "")
          : null,
        hash: parsed.hash,
        host: parsed.host,
        hostname: parsed.hostname,
        href: parsed.href,
        path: parsed.pathname + parsed.search,
        pathname: parsed.pathname,
        port: parsed.port,
        protocol: parsed.protocol,
        query: parseQueryString
          ? querystringModule.parse(parsed.search.slice(1))
          : parsed.search.slice(1),
        search: parsed.search,
        slashes: true,
      };
    },
  };

  const timersModule = {
    clearImmediate: window.clearImmediate || window.clearTimeout.bind(window),
    clearInterval: window.clearInterval.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setImmediate:
      window.setImmediate ||
      ((callback, ...args) => window.setTimeout(callback, 0, ...args)),
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
    "@tweenjs/tween.js": tweenModule,
    lodash: lodashModule,
    rxjs: rxjsModule,
    "rxjs/ajax": rxjsAjaxModule,
    "rxjs/fetch": rxjsFetchModule,
    "rxjs/operators": rxjsOperatorsModule,
    "rxjs/testing": rxjsTestingModule,
    "rxjs/webSocket": rxjsWebSocketModule,
    xlsx: xlsxModule,
  };
  if (window.__MzPlayerNodeNlpModule) {
    modules["node-nlp"] = window.__MzPlayerNodeNlpModule;
  }

  class StringDecoderShim {
    constructor(encoding = "utf8") {
      this.encoding = String(encoding).toLowerCase().replace(/[-_]/gu, "");
      const decoderEncoding =
        this.encoding === "utf16le" || this.encoding === "ucs2"
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
      return (
        (value === undefined ? "" : this.write(value)) + this.decoder.decode()
      );
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
      const parentFilename =
        filename instanceof URL
          ? urlModule.fileURLToPath(filename)
          : String(filename || mainModule.filename);
      const createdRequire = (request) => requireModule(request, parentFilename);
      createdRequire.cache = commonJsRequireCache;
      createdRequire.main = mainModule;
      createdRequire.resolve = (request) =>
        requireModule.resolve(request, parentFilename);
      return createdRequire;
    },
    isBuiltin(name) {
      return Object.prototype.hasOwnProperty.call(modules, String(name));
    },
  };
  modules.module = moduleModule;
  modules["node:module"] = moduleModule;
  moduleModule.builtinModules.push("module");

  return {
    commonJsModuleCache,
    commonJsRequireCache,
    greenworksNativeFallback,
    mainModule,
    modules,
    osModule,
    steamNativeFallback,
    timersModule,
  };
}
