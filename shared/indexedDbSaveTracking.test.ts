import { afterEach, describe, expect, it, vi } from "vitest";
import {
  trackIndexedDbDatabases,
  trackedIndexedDbMarkerKey,
} from "@/shared/indexedDbSaveTracking";

class MemoryStorage {
  readonly values = new Map<string, string>();

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("IndexedDB save tracking", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("records databases opened by an embedded game outside its visible namespace", () => {
    const namespace = "mz-player:game-1:";
    const localStorage = new MemoryStorage();
    const open = vi.fn(() => ({ request: "open" }));
    const deleteDatabase = vi.fn(() => ({ addEventListener: vi.fn() }));
    const indexedDB = { open, deleteDatabase };

    vi.stubGlobal("Storage", MemoryStorage);
    vi.stubGlobal("window", { indexedDB, localStorage });

    trackIndexedDbDatabases(namespace);
    const request = (indexedDB as unknown as IDBFactory).open(
      "_C2SaveStates",
      2,
    );

    expect(request).toEqual({ request: "open" });
    expect(open).toHaveBeenCalledWith("_C2SaveStates", 2);
    const marker = trackedIndexedDbMarkerKey(namespace, "_C2SaveStates");
    expect(marker.startsWith(namespace)).toBe(false);
    expect(localStorage.values.get(marker)).toBe("1");
  });
});
