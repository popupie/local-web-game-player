import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCryptoRuntime } from "../player-runtime/desktop/crypto";
import { createFsRuntime } from "../player-runtime/desktop/fs";
import { createNwRuntime } from "../player-runtime/desktop/nw";
import { createPathRuntime } from "../player-runtime/desktop/path";
import { createProcessRuntime } from "../player-runtime/desktop/process";

type RuntimeGlobal = typeof globalThis & {
  window: any;
};

type StorageLike = {
  clear(): void;
  getItem(key: string): string | null;
  key(index: number): string | null;
  readonly length: number;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
};

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(String(key)) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    get length() {
      return values.size;
    },
    removeItem(key: string) {
      values.delete(String(key));
    },
    setItem(key: string, value: string) {
      values.set(String(key), String(value));
    },
  };
}

function installWindowShim(files: Record<string, string> = {}) {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const storage = createMemoryStorage();
  const windowShim: any = {
    Buffer,
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
    addEventListener(type: string, listener: (event: Event) => void) {
      const bucket = listeners.get(type) ?? new Set();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    atob(value: string) {
      return Buffer.from(value, "base64").toString("binary");
    },
    btoa(value: string) {
      return Buffer.from(value, "binary").toString("base64");
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
    document: { documentElement: { clientWidth: 816, clientHeight: 624 }, title: "Test Game" },
    localStorage: storage,
    location: { origin: "http://player.test" },
    navigator: { deviceMemory: 8, hardwareConcurrency: 4 },
    open: vi.fn(() => ({ focus: vi.fn() })),
    parent: { postMessage: vi.fn() },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  windowShim.crypto = globalThis.crypto;

  class TestXMLHttpRequest {
    responseText = "";
    status = 0;
    private url = "";

    open(_method: string, url: string) {
      this.url = url;
    }

    overrideMimeType() {
      return undefined;
    }

    send() {
      const path = this.url.replace(/^https?:\/\/[^/]+/, "");
      if (Object.prototype.hasOwnProperty.call(files, path)) {
        this.status = 200;
        this.responseText = files[path];
        return;
      }
      this.status = 404;
      this.responseText = "";
    }
  }

  windowShim.window = windowShim;
  Object.assign(globalThis, {
    document: windowShim.document,
    XMLHttpRequest: TestXMLHttpRequest,
    window: windowShim,
  });
  return storage;
}

const manifestConfig = {
  entryId: "game-1",
  fileRoutePrefix: "/play/game-1/",
  files: [
    { path: "www/index.html", url: "/play/game-1/www/index.html", size: 11, mimeType: "text/html", name: "index.html" },
    { path: "www/js/app.js", url: "/play/game-1/www/js/app.js", size: 15, mimeType: "text/javascript", name: "app.js" },
    { path: "www/js/config.json", url: "/play/game-1/www/js/config.json", size: 13, mimeType: "application/json", name: "config.json" },
    { path: "www/data/default.txt", url: "/play/game-1/www/data/default.txt", size: 7, mimeType: "text/plain", name: "default.txt" },
    { path: "www/_greenworks_debug.log", url: "/play/game-1/www/_greenworks_debug.log", size: 8, mimeType: "text/plain", name: "_greenworks_debug.log" },
    { path: "www/greenworks.js", url: "/play/game-1/www/greenworks.js", size: 18, mimeType: "text/javascript", name: "greenworks.js" },
    { path: "www/node_modules/example-package/package.json", url: "/play/game-1/www/node_modules/example-package/package.json", size: 19, mimeType: "application/json", name: "package.json" },
    { path: "www/node_modules/example-package/lib/main.js", url: "/play/game-1/www/node_modules/example-package/lib/main.js", size: 29, mimeType: "text/javascript", name: "main.js" },
    { path: "Steam4C2.js", url: "/play/game-1/Steam4C2.js", size: 360, mimeType: "text/javascript", name: "Steam4C2.js" },
  ],
};

describe("desktop path runtime", () => {
  it("normalizes paths and resolves manifest aliases", () => {
    const runtime = createPathRuntime(manifestConfig);
    const pathModule = runtime.pathModule as any;

    expect(pathModule.join("www", "save", "..", "data", "Actors.json")).toBe("www/data/Actors.json");
    expect(pathModule.dirname("/www/js/app.js")).toBe("/www/js");
    expect(pathModule.basename("/www/js/app.js")).toBe("app.js");
    expect(pathModule.extname("/www/js/app.js")).toBe(".js");
    expect(pathModule.parse("/www/js/plugins/foo.js")).toEqual({
      root: "/",
      dir: "/www/js/plugins",
      base: "foo.js",
      ext: ".js",
      name: "foo",
    });
    expect(pathModule.parse("www\\js\\plugins\\.config")).toEqual({
      root: "",
      dir: "www/js/plugins",
      base: ".config",
      ext: "",
      name: ".config",
    });
    expect(pathModule.isAbsolute("/www/js/app.js")).toBe(true);
    expect(pathModule.relative("/www/js", "/www/data/System.json")).toBe("../data/System.json");
    expect(pathModule.format({ dir: "/www/js", name: "app", ext: ".js" })).toBe("/www/js/app.js");
    expect(pathModule.resolve("js", "plugins", "..", "app.js")).toBe("/www/js/app.js");
    expect(pathModule.posix).toBe(pathModule);
    expect(pathModule.win32.join("www", "js", "app.js")).toBe("www\\js\\app.js");
    expect(runtime.lookupManifestFile("js/app.js")?.path).toBe("www/js/app.js");
    expect(runtime.lookupManifestFile("WWW/JS/APP.JS")?.path).toBe("www/js/app.js");
    expect(runtime.manifestDirExists("js")).toBe(true);
  });
});

describe("desktop fs runtime", () => {
  beforeEach(() => {
    installWindowShim({
      "/play/game-1/www/index.html": "<html></html>",
      "/play/game-1/www/data/default.txt": "default",
      "/play/game-1/www/_greenworks_debug.log": "packaged",
    });
  });

  it("supports virtual fs operations and manifest metadata", async () => {
    const pathRuntime = createPathRuntime(manifestConfig);
    const fs = createFsRuntime({
      BrowserBuffer: Buffer,
      bytesToBase64: (bytes: Uint8Array) => Buffer.from(bytes).toString("base64"),
      bytesToHex: (bytes: Uint8Array) => Buffer.from(bytes).toString("hex"),
      config: manifestConfig,
      enhancedBytes: (bytes: Uint8Array) => Buffer.from(bytes),
      pathRuntime,
    }).fsModule as any;

    expect(fs.existsSync("www/index.html")).toBe(true);
    expect(fs.readFileSync("www/index.html", "utf8")).toBe("<html></html>");

    fs.mkdirSync("save");
    fs.writeFileSync("save/file1.rpgsave", "alpha");
    fs.appendFileSync("save/file1.rpgsave", "-beta");
    expect(fs.readFileSync("save/file1.rpgsave", "utf8")).toBe("alpha-beta");
    expect(await fs.promises.readFile("save/file1.rpgsave", "utf8")).toBe("alpha-beta");
    await fs.promises.appendFile("save/file1.rpgsave", "-gamma");
    expect(fs.readFileSync("save/file1.rpgsave", "utf8")).toBe("alpha-beta-gamma");

    fs.copyFileSync("www/data/default.txt", "save/default.txt");
    expect(fs.readFileSync("save/default.txt", "utf8")).toBe("default");
    fs.writeFileSync("save/utf16.txt", "日本語", "utf16le");
    expect(fs.readFileSync("save/utf16.txt", "utf16le")).toBe("日本語");
    expect(fs.realpathSync("save/default.txt")).toBe("save/default.txt");
    expect(fs.statSync("save/default.txt").mtimeMs).toBeGreaterThan(0);
    fs.writeFileSync("/www/_greenworks_debug.log", "");
    fs.appendFileSync("/www/_greenworks_debug.log", "browser log");
    expect(fs.readFileSync("/www/_greenworks_debug.log", "utf8")).toBe("browser log");
    expect(fs.readdirSync("save", { withFileTypes: true }).find((entry: any) => entry.name === "default.txt")?.isFile()).toBe(true);

    const fd = fs.openSync("save/descriptor.txt", "w+");
    expect(fs.writeSync(fd, Buffer.from("descriptor"), 0, 10, 0)).toBe(10);
    const descriptorBytes = Buffer.alloc(10);
    expect(fs.readSync(fd, descriptorBytes, 0, 10, 0)).toBe(10);
    expect(descriptorBytes.toString()).toBe("descriptor");
    fs.ftruncateSync(fd, 4);
    expect(fs.fstatSync(fd).size).toBe(4);
    fs.closeSync(fd);

    fs.copyFileSync("save/file1.rpgsave", "save/file2.rpgsave");
    fs.renameSync("save/file2.rpgsave", "save/file3.rpgsave");
    expect(fs.readdirSync("save")).toContain("file3.rpgsave");
    expect(fs.statSync("save/file3.rpgsave").isFile()).toBe(true);
    fs.unlinkSync("save/file3.rpgsave");
    expect(fs.existsSync("save/file3.rpgsave")).toBe(false);
    fs.rmSync("save", { recursive: true });
    expect(fs.existsSync("save/file1.rpgsave")).toBe(false);
  });
});

describe("desktop globals", () => {
  beforeEach(() => {
    installWindowShim();
  });

  it("provides nw, process, and crypto compatibility shims", () => {
    const { clipboardShim, nwGuiModule } = createNwRuntime();
    clipboardShim.set("copied");
    expect(nwGuiModule.Clipboard.get().get()).toBe("copied");
    expect(nwGuiModule.Window.get().removeAllListeners()).toBe(nwGuiModule.Window.get());
    expect(nwGuiModule.Window.get().enterFullscreen()).toBeUndefined();
    expect(nwGuiModule.Window.get().leaveFullscreen()).toBeUndefined();
    nwGuiModule.Window.get().title = "Updated Game";
    expect(nwGuiModule.Window.get().title).toBe("Updated Game");
    expect(nwGuiModule.App.dataPath).toContain("local-web-game-player");
    expect(new (nwGuiModule.Menu as any)().items).toEqual([]);

    const processModule = createProcessRuntime() as any;
    expect(processModule.cwd()).toBe("/www");
    expect(processModule.versions.nw).toBeTruthy();
    processModule.chdir("save");
    expect(processModule.cwd()).toBe("/www/save");

    const windowsProcess = createProcessRuntime({ platform: "win32", arch: "x64" }) as any;
    expect(windowsProcess.platform).toBe("win32");
    expect(windowsProcess.arch).toBe("x64");

    const cryptoModule = createCryptoRuntime({
      browserCryptoModule: {},
      enhancedBytes: (bytes: Uint8Array) => Buffer.from(bytes),
    });
    expect(cryptoModule.randomBytes(8)).toHaveLength(8);
  });

  it("installs global require for built-ins and packaged modules", async () => {
    installWindowShim({
      "/play/game-1/www/js/app.js": "module.exports = { value: require('./config.json').answer };",
      "/play/game-1/www/js/config.json": "{\"answer\":42}",
      "/play/game-1/www/node_modules/example-package/package.json": "{\"main\":\"lib/main\"}",
      "/play/game-1/www/node_modules/example-package/lib/main.js": "module.exports = { packageValue: 7 };",
      "/play/game-1/www/greenworks.js": "<html>native addon placeholder</html>",
      "/play/game-1/Steam4C2.js": "<html>This response must not be compiled as JavaScript.</html>",
    });
    const browserWindow = (globalThis as RuntimeGlobal).window;
    Object.defineProperty(browserWindow, "__MZ_PLAYER_DESKTOP_CONFIG", {
      configurable: true,
      value: manifestConfig,
    });
    Object.defineProperty(browserWindow, "__MzPlayerBufferModule", {
      configurable: true,
      value: Object.freeze({ Buffer }),
    });
    Object.defineProperty(browserWindow, "__MzPlayerCryptoModule", {
      configurable: true,
      value: Object.freeze({}),
    });

    await import("../player-runtime/desktop");

    const runtimeRequire = browserWindow.require as any;
    expect(typeof runtimeRequire).toBe("function");
    expect(runtimeRequire?.("path").join("www", "save", "file1.rpgsave")).toBe("www/save/file1.rpgsave");
    expect(runtimeRequire?.("node:path")).toBe(runtimeRequire?.("path"));
    expect(runtimeRequire?.("fs").existsSync("www/index.html")).toBe(true);
    expect(runtimeRequire?.("node:fs")).toBe(runtimeRequire?.("fs"));
    expect(runtimeRequire?.("nw.gui").Window.get().removeAllListeners()).toBe(runtimeRequire?.("nw.gui").Window.get());
    expect(typeof runtimeRequire?.("events").EventEmitter).toBe("function");
    expect(runtimeRequire?.("os").homedir()).toBe("/home/web-user");
    expect(runtimeRequire?.("os").platform()).toBe("win32");
    expect(runtimeRequire?.("os").cpus()).toHaveLength(4);
    expect(runtimeRequire?.("os").totalmem()).toBe(8 * 1024 ** 3);
    await new Promise<void>((resolve) => {
      runtimeRequire?.("child_process").exec("ignored", (error: Error | null, stdout: string, stderr: string) => {
        expect(error).toBeNull();
        expect(stdout).toBe("");
        expect(stderr).toBe("");
        resolve();
      });
    });
    expect(runtimeRequire?.("./Steam4C2-win64").initAPI()).toBe(false);
    expect(runtimeRequire?.("./Steam4C2").initAPI()).toBe(false);
    expect(runtimeRequire?.("./greenworks").initAPI()).toBe(false);
    expect(runtimeRequire?.("./lib/greenworks-win64.node").isSteamRunning()).toBe(false);
    expect(runtimeRequire?.("/www/js/app.js")).toEqual({ value: 42 });
    expect(runtimeRequire?.("example-package")).toEqual({ packageValue: 7 });
    expect(runtimeRequire?.resolve("example-package")).toBe("/www/node_modules/example-package/lib/main.js");
    expect(runtimeRequire?.("node:util").format("value=%d", 7)).toBe("value=7");
    expect(runtimeRequire?.("node:module").isBuiltin("node:path")).toBe(true);
    expect(runtimeRequire?.("string_decoder").StringDecoder).toBeTypeOf("function");
    expect(runtimeRequire?.("querystring").parse("a=1&a=2").a).toEqual(["1", "2"]);
    expect(runtimeRequire?.("electron").app.getPath("userData")).toContain("local-web-game-player");
    expect(runtimeRequire?.("child_process").spawnSync("ignored", { encoding: "utf8" }).stdout).toBe("");
    expect(browserWindow.global).toBe(browserWindow);
    expect(typeof browserWindow.setImmediate).toBe("function");
    expect(runtimeRequire?.main.filename).toBe("/www/index.html");
    expect(runtimeRequire?.cache["/www/node_modules/example-package/lib/main.js"].loaded).toBe(true);
    expect(Buffer.from("ok").toString("utf8")).toBe("ok");
  });
});
