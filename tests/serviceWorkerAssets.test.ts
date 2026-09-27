import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadServiceWorkerHelpers() {
  const context = vm.createContext({
    Blob,
    Response,
    TextDecoder,
    URL,
    Uint8Array,
    indexedDB: {},
    navigator: { storage: {} },
    self: {
      addEventListener() {
        return undefined;
      },
      clients: {
        claim() {
          return undefined;
        },
        matchAll() {
          return [];
        },
      },
      location: { origin: "http://player.test" },
      skipWaiting() {
        return undefined;
      },
    },
  });
  const source = readFileSync(resolve("public/player-sw.js"), "utf8");
  vm.runInContext(source, context);
  return context as any;
}

describe("service worker RPG Maker asset helpers", () => {
  it("maps encrypted image fallbacks by image family and detects decrypted MIME by bytes", () => {
    const helpers = loadServiceWorkerHelpers();
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
    const webpBytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

    expect(helpers.rpgMakerAssetPathAliases("www/img/pictures/logo.rpgmvp")).toContain("www/img/pictures/logo.jpg");
    expect(helpers.rpgMakerAssetPathAliases("www/img/pictures/logo.webp")).toContain("www/img/pictures/logo.rpgmvp");
    expect(helpers.shouldEncryptPlainFallbackForEncryptedRequest("www/img/pictures/logo.rpgmvp", "www/img/pictures/logo.jpg")).toBe(true);
    expect(helpers.plainRequestEncryptedFallbackMime("www/img/pictures/logo.webp", "www/img/pictures/logo.rpgmvp")).toBe("image/webp");
    expect(helpers.imageMimeForBytes(jpegBytes)).toBe("image/jpeg");
    expect(helpers.imageMimeForBytes(webpBytes)).toBe("image/webp");
  });

  it("detects plain/encrypted audio fallback directions", () => {
    const helpers = loadServiceWorkerHelpers();
    const oggBytes = Uint8Array.from([0x4f, 0x67, 0x67, 0x53, 0, 1, 2, 3]);
    const mp3Bytes = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0]);
    const wavBytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    const mp4Bytes = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);

    expect(helpers.shouldEncryptPlainFallbackForEncryptedRequest("www/audio/bgm/theme.rpgmvo", "www/audio/bgm/theme.ogg")).toBe(true);
    expect(helpers.shouldEncryptPlainFallbackForEncryptedRequest("www/audio/bgm/theme.rpgmvo", "www/audio/bgm/theme.m4a")).toBe(true);
    expect(helpers.shouldEncryptPlainFallbackForEncryptedRequest("www/audio/bgm/theme.rpgmvm", "www/audio/bgm/theme.mp3")).toBe(true);
    expect(helpers.shouldEncryptPlainFallbackForEncryptedRequest("www/audio/bgm/theme.ogg_", "www/audio/bgm/theme.ogg")).toBe(true);
    expect(helpers.shouldEncryptPlainFallbackForEncryptedRequest("www/audio/bgm/theme.ogg__", "www/audio/bgm/theme.ogg")).toBe(true);
    expect(helpers.shouldEncryptPlainFallbackForEncryptedRequest("www/audio/bgm/theme.rpgmvo__", "www/audio/bgm/theme.ogg_")).toBe(false);
    expect(helpers.shouldEncryptPlainFallbackForEncryptedRequest("www/audio/se/click.rpgmvm", "www/audio/se/click.m4a")).toBe(true);
    expect(helpers.plainRequestEncryptedFallbackMime("www/audio/bgm/theme.ogg", "www/audio/bgm/theme.rpgmvo")).toBe("audio/ogg");
    expect(helpers.plainRequestEncryptedFallbackMime("www/audio/bgm/theme.mp3", "www/audio/bgm/theme.rpgmvo")).toBe("audio/mpeg");
    expect(helpers.plainRequestEncryptedFallbackMime("www/audio/bgm/theme.ogg_", "www/audio/bgm/theme.rpgmvo___")).toBe(undefined);
    expect(helpers.plainRequestEncryptedFallbackMime("www/audio/se/click.m4a", "www/audio/se/click.rpgmvm")).toBe("audio/mp4");
    expect(helpers.mediaMimeForBytes(oggBytes)).toBe("audio/ogg");
    expect(helpers.mediaMimeForBytes(mp3Bytes)).toBe("audio/mpeg");
    expect(helpers.mediaMimeForBytes(wavBytes)).toBe("audio/wav");
    expect(helpers.mediaMimeForBytes(mp4Bytes, "audio/mp4")).toBe("audio/mp4");
  });

  it("aliases video assets without treating them as encrypted audio", () => {
    const helpers = loadServiceWorkerHelpers();
    const webmBytes = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    const mp4Bytes = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

    expect(helpers.rpgMakerAssetPathAliases("www/movies/opening.webm_")).toContain("www/movies/opening.mp4");
    expect(helpers.rpgMakerAssetPathAliases("www/movies/opening.mp4__")).toContain("www/movies/opening.webm");
    expect(helpers.shouldEncryptPlainFallbackForEncryptedRequest("www/movies/opening.webm_", "www/movies/opening.webm")).toBe(false);
    expect(helpers.plainRequestEncryptedFallbackMime("www/movies/opening.webm", "www/movies/opening.mp4_")).toBe(undefined);
    expect(helpers.mediaMimeForBytes(webmBytes)).toBe("video/webm");
    expect(helpers.mediaMimeForBytes(mp4Bytes, "video/mp4")).toBe("video/mp4");
  });

  it("round-trips RPG Maker encrypted asset bytes with a System.json key", () => {
    const helpers = loadServiceWorkerHelpers();
    const plainBytes = Uint8Array.from([0x4f, 0x67, 0x67, 0x53, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    const key = Uint8Array.from([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31]);

    const encrypted = helpers.encryptRpgMakerAsset(plainBytes, key);
    expect(encrypted.slice(0, 5)).toEqual(Uint8Array.from([0x52, 0x50, 0x47, 0x4d, 0x56]));
    expect(encrypted.slice(16, 32)).not.toEqual(plainBytes.slice(0, 16));
    expect(helpers.decryptRpgMakerAsset(encrypted, key)).toEqual(plainBytes);
  });

  it("passes through exact asset requests across compatibility extensions", async () => {
    const helpers = loadServiceWorkerHelpers();
    const bytes = Uint8Array.from([0x52, 0x50, 0x47, 0x4d, 0x56, 0, 0, 0, 0, 3, 1, 0, 1, 2, 3, 4]);
    const paths = [
      "www/img/system/Window.png_",
      "www/img/system/Window.png__",
      "www/img/system/Window.png___",
      "www/img/pictures/Logo.rpgmvp",
      "www/audio/bgm/Theme.ogg_",
      "www/audio/bgm/Theme.ogg__",
      "www/audio/bgm/Theme.ogg___",
      "www/audio/bgm/Theme.rpgmvo",
      "www/audio/bgm/Theme.rpgmvm",
      "www/movies/Opening.webm_",
      "www/movies/Opening.mp4__",
    ];

    for (const path of paths) {
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      const result = await helpers.transformAssetBlobForRequest(
        "game-1",
        { requestedPath: path, matchedPath: path },
        blob,
        undefined,
      );

      expect(result.error, path).toBeUndefined();
      expect(new Uint8Array(await result.blob.arrayBuffer()), path).toEqual(bytes);
    }
  });

  it("passes through encrypted suffix fallback matches without decrypting or re-encrypting", async () => {
    const helpers = loadServiceWorkerHelpers();
    const bytes = Uint8Array.from([0x52, 0x50, 0x47, 0x4d, 0x56, 0, 0, 0, 0, 3, 1, 0, 1, 2, 3, 4]);
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const result = await helpers.transformAssetBlobForRequest(
      "game-1",
      {
        requestedPath: "www/img/variablehud/Hud_1_gauge.png_",
        matchedPath: "www/img/variablehud/Hud_1_gauge.png__",
      },
      blob,
      undefined,
    );

    expect(result.error).toBeUndefined();
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(bytes);
  });
});

describe("service worker Tyrano compatibility helpers", () => {
  it("detects Tyrano exports from their runtime and config files", () => {
    const helpers = loadServiceWorkerHelpers();
    const tyranoFiles = [
      { path: "index.html" },
      { path: "tyrano/tyrano.js" },
      { path: "data/system/Config.tjs" },
    ];

    expect(helpers.isTyranoGame(tyranoFiles)).toBe(true);
    expect(helpers.isTyranoGame([{ path: "index.html" }, { path: "js/rmmz_core.js" }])).toBe(false);
  });

  it("uses browser storage for desktop Tyrano exports", () => {
    const helpers = loadServiceWorkerHelpers();
    const source = ";debugMenu.visible=false\n;configSave=file\n;projectID=test";

    expect(helpers.adaptTyranoConfig(source)).toContain(";configSave=webstorage");
  });

  it("omits Node desktop shims from Tyrano HTML while retaining the player bridge", () => {
    const helpers = loadServiceWorkerHelpers();
    const game = { id: "tyrano-1", settings: {} };
    const files = [
      { path: "index.html", size: 1, mime: "text/html" },
      { path: "tyrano/tyrano.js", size: 1, mime: "text/javascript" },
      { path: "data/system/Config.tjs", size: 1, mime: "text/plain" },
    ];
    const html = helpers.injectBridge("<html><head></head><body></body></html>", game, files);

    expect(html).toContain("/runtime-bridge.js");
    expect(html).not.toContain("/mz-player-runtime/desktop.js");
    expect(html).not.toContain("__MZ_PLAYER_DESKTOP_CONFIG");
  });

  it("keeps Node desktop shims for RPG Maker HTML", () => {
    const helpers = loadServiceWorkerHelpers();
    const game = { id: "rpg-1", settings: {} };
    const files = [
      { path: "index.html", size: 1, mime: "text/html" },
      { path: "js/rmmz_core.js", size: 1, mime: "text/javascript" },
    ];
    const html = helpers.injectBridge("<html><head></head><body></body></html>", game, files);

    expect(html).toContain("/mz-player-runtime/desktop.js");
    expect(html).toContain("__MZ_PLAYER_DESKTOP_CONFIG");
  });
});

describe("service worker Construct 2 NW.js compatibility helpers", () => {
  it("keeps Steam4C2 usable as both a page script and CommonJS module", () => {
    const helpers = loadServiceWorkerHelpers();
    const source = "var Steam4C2 = {}; module.exports = Steam4C2;";
    const adapted = helpers.adaptSteam4C2Bridge(source);

    expect(helpers.isSteam4C2BridgePath("Steam4C2.js")).toBe(true);
    expect(adapted).toContain('typeof module !== "undefined"');
    expect(adapted).not.toContain("; module.exports = Steam4C2;");
  });
});
