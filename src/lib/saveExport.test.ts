import { describe, expect, it } from "vitest";
import { INDEXED_DB_MARKER_PREFIX } from "@/shared/indexedDbSaveTracking";
import {
  VFS_BINARY_PREFIX,
  VFS_FILE_PREFIX,
  VFS_META_PREFIX,
} from "@/shared/virtualFileSystem";
import {
  collectSaveExportEntries,
  exportIndexedDbRecord,
} from "@/src/lib/saveExport";

function storageFrom(entries: Record<string, string>) {
  const records = Object.entries(entries);
  return {
    length: records.length,
    key(index: number) {
      return records[index]?.[0] ?? null;
    },
    getItem(key: string) {
      return entries[key] ?? null;
    },
  };
}

describe("save export", () => {
  it("exports RPG Maker, local storage, and emulated filesystem saves", () => {
    const prefix = "mz-player:game-1:";
    const entries = collectSaveExportEntries(
      "game-1",
      storageFrom({
        [`${prefix}RPG File2`]: "rpg-data",
        [`${prefix}rmmzsave.file3`]: "mz-data",
        [`${prefix}localforage/rmmzsave.global`]: "mz-global",
        [`${prefix}__c2save_quick slot`]: "construct-data",
        [`${prefix}tyrano_data`]: "tyrano-data",
        [`${prefix}${VFS_FILE_PREFIX}profile/save.bin`]:
          `${VFS_BINARY_PREFIX}AQID`,
        [`${prefix}${VFS_META_PREFIX}profile/save.bin`]: "metadata",
        [`${prefix}${INDEXED_DB_MARKER_PREFIX}_C2SaveStates`]: "legacy-marker",
        "mz-player:another-game:RPG File1": "other-game",
      }),
    );

    expect(entries.map((entry) => entry.path)).toEqual([
      "localStorage/tyrano_data.txt",
      "profile/save.bin",
      "save/file2.rpgsave",
      "save/file3.rmmzsave",
      "save/global.rmmzsave",
      "save/quick%20slot.json",
    ]);
    expect(entries.find((entry) => entry.path === "profile/save.bin")?.data).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("extracts WOLF IDBFS save files from the persistent save database", async () => {
    const entry = await exportIndexedDbRecord({
      database: "/data0/game-1_project-Save",
      store: "FILE_DATA",
      key: "/data0/game-1_project-Save/Save/SaveData01.sav",
      value: { contents: new Uint8Array([4, 5, 6]) },
    });

    expect(entry).toEqual({
      path: "Save/SaveData01.sav",
      data: new Uint8Array([4, 5, 6]),
    });
  });

  it("exports Construct 2 save slots as JSON files", async () => {
    const entry = await exportIndexedDbRecord({
      database: "_C2SaveStates",
      store: "saves",
      key: "autosave",
      value: { slot: "autosave", data: '{"c2save":true}' },
    });

    expect(entry).toEqual({
      path: "save/autosave.json",
      data: '{"c2save":true}',
    });
  });

  it("exports RPG Maker MZ localForage records as native save files", async () => {
    const entry = await exportIndexedDbRecord({
      database: "localforage",
      store: "keyvaluepairs",
      key: "rmmzsave.autosave",
      value: "compressed-save",
    });

    expect(entry).toEqual({
      path: "save/autosave.rmmzsave",
      data: "compressed-save",
    });
  });

  it("preserves other engine-owned IndexedDB records", async () => {
    const entry = await exportIndexedDbRecord({
      database: "cocos-saves",
      store: "profiles",
      key: "slot 1",
      value: { chapter: 3 },
    });

    expect(entry?.path).toBe(
      "indexedDB/cocos-saves/profiles/slot%201.json",
    );
    expect(entry?.data).toContain('"chapter": 3');
  });
});
