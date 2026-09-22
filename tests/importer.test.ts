import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { candidateFromDirectoryHandle, candidateFromFolder, candidateFromZip, decodeZipFileName } from "../src/lib/importer";
import type { BrowserFileSystemDirectoryHandle, BrowserFileSystemFileHandle } from "../src/lib/storage";

function fileHandle(name: string, contents: number | string | Uint8Array): BrowserFileSystemFileHandle {
  return {
    kind: "file",
    name,
    async getFile() {
      const body = typeof contents === "number"
        ? new Uint8Array(contents)
        : typeof contents === "string"
          ? contents
          : Uint8Array.from(contents);
      return new File([body], name);
    },
    async createWritable() {
      throw new Error("Test file handles are read-only.");
    },
  };
}

function directoryHandle(
  name: string,
  entries: Record<string, BrowserFileSystemDirectoryHandle | BrowserFileSystemFileHandle>
): BrowserFileSystemDirectoryHandle {
  return {
    kind: "directory",
    name,
    async *entries() {
      for (const entry of Object.entries(entries)) {
        yield entry;
      }
    },
    async getDirectoryHandle(entryName: string) {
      const entry = entries[entryName];
      if (!entry || entry.kind !== "directory") throw new Error(`Missing directory: ${entryName}`);
      return entry;
    },
    async getFileHandle(entryName: string) {
      const entry = entries[entryName];
      if (!entry || entry.kind !== "file") throw new Error(`Missing file: ${entryName}`);
      return entry;
    },
    async removeEntry() {
      throw new Error("Test directory handles are read-only.");
    },
  };
}

function webkitFile(path: string, contents: number | string | Uint8Array): File {
  const name = path.split("/").at(-1) ?? path;
  const body = typeof contents === "number"
    ? new Uint8Array(contents)
    : typeof contents === "string"
      ? contents
      : Uint8Array.from(contents);
  const file = new File([body], name);
  Object.defineProperty(file, "webkitRelativePath", {
    value: path,
  });
  return file;
}

describe("ZIP filename decoding", () => {
  it("decodes UTF-8 names", () => {
    const bytes = new TextEncoder().encode("www/img/pictures/説明14.rpgmvp");

    expect(decodeZipFileName(bytes)).toBe("www/img/pictures/説明14.rpgmvp");
  });

  it("falls back to Shift_JIS names", () => {
    const bytes = new Uint8Array([
      119, 119, 119, 47, 105, 109, 103, 47, 112, 105, 99, 116, 117, 114, 101, 115, 47, 144, 224, 150, 190, 49, 52,
      46, 114, 112, 103, 109, 118, 112
    ]);

    expect(decodeZipFileName(bytes)).toBe("www/img/pictures/説明14.rpgmvp");
  });
});

describe("folder handle scanning", () => {
  it("scans metadata, strips a common wrapper, finds the entrypoint, and keeps source paths", async () => {
    const handle = directoryHandle("Downloads", {
      Game: directoryHandle("Game", {
        "index.html": fileHandle("index.html", 10),
        js: directoryHandle("js", {
          "main.js": fileHandle("main.js", 20),
        }),
        data: directoryHandle("data", {
          "Actors.json": fileHandle("Actors.json", 30),
        }),
      }),
    });

    const candidate = await candidateFromDirectoryHandle(handle);

    expect(candidate.title).toBe("Game");
    expect(candidate.entryPath).toBe("index.html");
    expect(candidate.files).toMatchObject([
      { path: "index.html", sourcePath: "Game/index.html", size: 10 },
      { path: "js/main.js", sourcePath: "Game/js/main.js", size: 20 },
      { path: "data/Actors.json", sourcePath: "Game/data/Actors.json", size: 30 },
    ]);
    expect(candidate.totalBytes).toBe(60);
  });

  it("uses the RPG Maker title from System.json", async () => {
    const handle = directoryHandle("Downloads", {
      Game: directoryHandle("Game", {
        "index.html": fileHandle("index.html", 10),
        data: directoryHandle("data", {
          "System.json": fileHandle("System.json", JSON.stringify({ gameTitle: "Actual Game" })),
        }),
      }),
    });

    const candidate = await candidateFromDirectoryHandle(handle);

    expect(candidate.title).toBe("Actual Game");
  });

  it("falls back to the selected folder name when System.json has no title", async () => {
    const handle = directoryHandle("Selected Game", {
      www: directoryHandle("www", {
        "index.html": fileHandle("index.html", 10),
        data: directoryHandle("data", {
          "System.json": fileHandle("System.json", JSON.stringify({ gameTitle: "" })),
        }),
      }),
    });

    const candidate = await candidateFromDirectoryHandle(handle);

    expect(candidate.title).toBe("Selected Game");
  });

  it("falls back to the nested game folder when the selected folder wraps it", async () => {
    const handle = directoryHandle("Outer", {
      Inner: directoryHandle("Inner", {
        "index.html": fileHandle("index.html", 10),
        data: directoryHandle("data", {
          "System.json": fileHandle("System.json", JSON.stringify({ gameTitle: "" })),
        }),
      }),
    });

    const candidate = await candidateFromDirectoryHandle(handle);

    expect(candidate.title).toBe("Inner");
  });

  it("uses an extracted Construct 2 game's HTML title", async () => {
    const handle = directoryHandle("nw_extract", {
      "index.html": fileHandle("index.html", "<title>Arcana Heat and Cold</title>"),
      "c2runtime.js": fileHandle("c2runtime.js", 20),
      "data.js": fileHandle("data.js", 30),
    });

    const candidate = await candidateFromDirectoryHandle(handle);

    expect(candidate.title).toBe("Arcana Heat and Cold");
    expect(candidate.entryPath).toBe("index.html");
  });
});

describe("webkit folder scanning", () => {
  it("scans session metadata, strips a common wrapper, and keeps file references", async () => {
    const files = [
      webkitFile("Game/index.html", 10),
      webkitFile("Game/js/main.js", 20),
      webkitFile("Game/data/Actors.json", 30),
    ];

    const candidate = await candidateFromFolder(files);

    expect(candidate.title).toBe("Game");
    expect(candidate.entryPath).toBe("index.html");
    expect(candidate.files).toMatchObject([
      { path: "index.html", size: 10, mime: "text/html; charset=utf-8" },
      { path: "js/main.js", size: 20, mime: "text/javascript; charset=utf-8" },
      { path: "data/Actors.json", size: 30, mime: "application/json; charset=utf-8" },
    ]);
    expect(candidate.files.map((entry) => entry.file)).toEqual(files);
    expect(candidate.totalBytes).toBe(60);
  });

  it("uses the RPG Maker title when upload paths have no wrapper folder", async () => {
    const files = [
      webkitFile("index.html", 10),
      webkitFile("data/System.json", JSON.stringify({ gameTitle: "Actual Game" })),
    ];

    const candidate = await candidateFromFolder(files);

    expect(candidate.title).toBe("Actual Game");
    expect(candidate.entryPath).toBe("index.html");
  });

  it("falls back to the selected folder name when upload paths have no game title", async () => {
    const files = [
      webkitFile("index.html", 10),
      webkitFile("data/System.json", JSON.stringify({ gameTitle: "" })),
    ];

    const candidate = await candidateFromFolder(files, "Selected Game");

    expect(candidate.title).toBe("Selected Game");
    expect(candidate.entryPath).toBe("index.html");
  });

  it("falls back to the nested game folder for wrapped uploads with no game title", async () => {
    const files = [
      webkitFile("Outer/Inner/index.html", 10),
      webkitFile("Outer/Inner/data/System.json", JSON.stringify({ gameTitle: "" })),
    ];

    const candidate = await candidateFromFolder(files, "Outer");

    expect(candidate.title).toBe("Inner");
    expect(candidate.entryPath).toBe("Outer/Inner/index.html");
  });

  it("uses an extracted Construct 2 game's HTML title", async () => {
    const files = [
      webkitFile("nw_extract/index.html", "<html><head><title>Arcana Heat and Cold</title></head></html>"),
      webkitFile("nw_extract/c2runtime.js", 20),
      webkitFile("nw_extract/data.js", 30),
    ];

    const candidate = await candidateFromFolder(files);

    expect(candidate.title).toBe("Arcana Heat and Cold");
    expect(candidate.entryPath).toBe("index.html");
  });
});

describe("ZIP scanning", () => {
  it("uses the RPG Maker title from System.json", async () => {
    const zip = new JSZip();
    zip.file("index.html", "");
    zip.file("data/System.json", JSON.stringify({ gameTitle: "Actual Game" }));
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const file = Object.assign(bytes, {
      name: "archive.zip",
      size: bytes.byteLength,
    }) as unknown as File;

    const candidate = await candidateFromZip(file);

    expect(candidate.title).toBe("Actual Game");
    expect(candidate.entryPath).toBe("index.html");
  });

  it("falls back to the nested game folder when the ZIP wraps it", async () => {
    const zip = new JSZip();
    zip.file("Outer/Inner/index.html", "");
    zip.file("Outer/Inner/data/System.json", JSON.stringify({ gameTitle: "" }));
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const file = Object.assign(bytes, {
      name: "archive.zip",
      size: bytes.byteLength,
    }) as unknown as File;

    const candidate = await candidateFromZip(file);

    expect(candidate.title).toBe("Inner");
    expect(candidate.entryPath).toBe("Outer/Inner/index.html");
  });
});
