import { describe, expect, it } from "vitest";
import {
  findEntryPath,
  mojibakePathAliases,
  normalizeStoredPath,
  pathLookupAliases,
  rpgMakerAssetPathAliases,
  stripCommonWrapper,
  titleFromEntry,
} from "../src/lib/paths";

describe("path helpers", () => {
  it("normalizes separators and removes traversal", () => {
    expect(normalizeStoredPath("\\Game//www/../index.html")).toBe("Game/index.html");
    expect(normalizeStoredPath("/Game/./www/index.html")).toBe("Game/www/index.html");
    expect(normalizeStoredPath("/Game/WWW/Index.HTML")).toBe("Game/WWW/Index.HTML");
  });

  it("strips a common archive wrapper when it contains an entrypoint", () => {
    const stripped = stripCommonWrapper([
      { path: "Wrapped/index.html" },
      { path: "Wrapped/js/main.js" }
    ]);

    expect(stripped.map((entry) => entry.path)).toEqual(["index.html", "js/main.js"]);
  });

  it("finds root or www entrypoints", () => {
    expect(findEntryPath(["data/Actors.json", "www/index.html"])).toBe("www/index.html");
    expect(findEntryPath(["index.html", "www/index.html"])).toBe("index.html");
  });

  it("creates a stable title from paths or filename fallback", () => {
    expect(titleFromEntry(["Game/index.html", "Game/js/main.js"], "archive.zip")).toBe("Game");
    expect(titleFromEntry(["index.html"], "archive.zip")).toBe("archive");
  });

  it("recovers common Japanese mojibake path aliases", () => {
    const samples = [
      ["www/img/pictures/■制作・クレジット.txt", "www/img/pictures/üíÉºì∞üEâNâîâWâbâg.txt"],
      ["www/img/pictures/a_地図1.rpgmvp", "www/img/pictures/a_ÆnÉ}1.rpgmvp"],
      ["www/img/pictures/AAA_説明14.rpgmvp", "www/img/pictures/AAA_Éαû╛14.rpgmvp"],
      ["www/img/pictures/アイテム_杖.rpgmvp", "www/img/pictures/âAâCâeâÇ_Å±.rpgmvp"]
    ];

    for (const [requestedPath, storedPath] of samples) {
      expect(mojibakePathAliases(storedPath)).toContain(requestedPath);
    }
  });

  it("matches composed and decomposed Unicode filename aliases", () => {
    const requestedPath = "www/fonts/ロゴたいぷゴシックCondense.otf";
    const storedPath = requestedPath.normalize("NFD");

    expect(storedPath).toBe("www/fonts/ロゴたいぷゴシックCondense.otf");
    expect(normalizeStoredPath(storedPath)).toBe(storedPath);
    expect(pathLookupAliases(storedPath)).toContain(requestedPath);
    expect(pathLookupAliases(requestedPath)).toContain(storedPath);
  });

  it("matches RPG Maker encrypted image asset aliases", () => {
    expect(rpgMakerAssetPathAliases("www/img/pictures/title.png")).toEqual([
      "www/img/pictures/title.rpgmvp",
      "www/img/pictures/title.png_",
      "www/img/pictures/title.png__",
      "www/img/pictures/title.png___",
    ]);
    expect(rpgMakerAssetPathAliases("www/img/pictures/title.rpgmvp")).toEqual([
      "www/img/pictures/title.png_",
      "www/img/pictures/title.png__",
      "www/img/pictures/title.png___",
      "www/img/pictures/title.png",
      "www/img/pictures/title.jpg",
      "www/img/pictures/title.jpeg",
      "www/img/pictures/title.webp",
      "www/img/pictures/title.gif",
    ]);
    expect(pathLookupAliases("www/img/pictures/title.png")).toContain("www/img/pictures/title.rpgmvp");
    expect(pathLookupAliases("www/img/pictures/title.jpg")).toContain("www/img/pictures/title.rpgmvp");
    expect(pathLookupAliases("www/img/pictures/title.webp")).toContain("www/img/pictures/title.rpgmvp");
    expect(pathLookupAliases("www/img/pictures/title.rpgmvp")).toContain("www/img/pictures/title.png");
    expect(pathLookupAliases("www/img/pictures/title.rpgmvp")).toContain("www/img/pictures/title.jpg");
  });

  it("matches RPG Maker encrypted audio asset aliases", () => {
    expect(rpgMakerAssetPathAliases("www/audio/bgm/theme.ogg")).toEqual(
      expect.arrayContaining([
        "www/audio/bgm/theme.ogg_",
        "www/audio/bgm/theme.ogg__",
        "www/audio/bgm/theme.ogg___",
        "www/audio/bgm/theme.rpgmvo",
        "www/audio/bgm/theme.rpgmvo_",
        "www/audio/bgm/theme.rpgmvo__",
        "www/audio/bgm/theme.rpgmvo___",
        "www/audio/bgm/theme.rpgmvm",
      ]),
    );
    expect(rpgMakerAssetPathAliases("www/audio/se/click.m4a")).toContain("www/audio/se/click.rpgmvm");
    expect(rpgMakerAssetPathAliases("www/audio/se/click.mp3")).toContain("www/audio/se/click.rpgmvo");
    expect(rpgMakerAssetPathAliases("www/audio/se/click.rpgmvo")).toContain("www/audio/se/click.m4a");
    expect(rpgMakerAssetPathAliases("www/audio/se/click.rpgmvo")).toContain("www/audio/se/click.mp3");
    expect(pathLookupAliases("www/audio/bgm/theme.rpgmvo")).toContain("www/audio/bgm/theme.ogg");
    expect(pathLookupAliases("www/audio/se/click.rpgmvm")).toContain("www/audio/se/click.m4a");
    expect(pathLookupAliases("www/audio/bgm/theme.ogg_")).toContain("www/audio/bgm/theme.rpgmvo");
    expect(pathLookupAliases("www/audio/bgm/theme.rpgmvo__")).toContain("www/audio/bgm/theme.ogg");
    expect(pathLookupAliases("www/audio/se/click.m4a___")).toContain("www/audio/se/click.rpgmvm");
  });

  it("matches RPG Maker video asset aliases and suffix variants", () => {
    expect(rpgMakerAssetPathAliases("www/movies/opening.webm")).toEqual([
      "www/movies/opening.webm_",
      "www/movies/opening.webm__",
      "www/movies/opening.webm___",
      "www/movies/opening.mp4",
      "www/movies/opening.mp4_",
      "www/movies/opening.mp4__",
      "www/movies/opening.mp4___",
    ]);
    expect(pathLookupAliases("www/movies/opening.webm_")).toContain("www/movies/opening.mp4");
    expect(pathLookupAliases("www/movies/opening.mp4__")).toContain("www/movies/opening.webm");
  });

  it("combines mojibake path recovery with RPG Maker asset aliases", () => {
    expect(pathLookupAliases("www/img/pictures/a_ÆnÉ}1.png")).toContain("www/img/pictures/a_地図1.rpgmvp");
  });
});
