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
    document: { documentElement: { clientWidth: 816, clientHeight: 624 } },
    localStorage: storage,
    location: { origin: "http://player.test" },
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
    expect(runtime.lookupManifestFile("js/app.js")?.path).toBe("www/js/app.js");
    expect(runtime.lookupManifestFile("WWW/JS/APP.JS")?.path).toBe("www/js/app.js");
    expect(runtime.manifestDirExists("js")).toBe(true);
  });
});

describe("desktop fs runtime", () => {
  beforeEach(() => {
    installWindowShim({
      "/play/game-1/www/index.html": "<html></html>",
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

    const processModule = createProcessRuntime() as any;
    expect(processModule.cwd()).toBe("/www");

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

    const runtimeRequire = browserWindow.require as ((name: string) => any) | undefined;
    expect(typeof runtimeRequire).toBe("function");
    expect(runtimeRequire?.("path").join("www", "save", "file1.rpgsave")).toBe("www/save/file1.rpgsave");
    expect(runtimeRequire?.("fs").existsSync("www/index.html")).toBe(true);
    expect(runtimeRequire?.("nw.gui").Window.get().removeAllListeners()).toBe(runtimeRequire?.("nw.gui").Window.get());
    expect(typeof runtimeRequire?.("events").EventEmitter).toBe("function");
    expect(runtimeRequire?.("os").homedir()).toBe("/home/web-user");
    expect(runtimeRequire?.("os").platform()).toBe("win32");
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
    expect(runtimeRequire?.("/www/js/app.js")).toEqual({ value: 42 });
    expect(Buffer.from("ok").toString("utf8")).toBe("ok");
  });
});
