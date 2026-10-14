import JSZip from "jszip";
import {
  INDEXED_DB_MARKER_PREFIX,
  trackedIndexedDbMarkerPrefix,
} from "@/shared/indexedDbSaveTracking";
import {
  VFS_BINARY_PREFIX,
  VFS_DIR_PREFIX,
  VFS_FILE_PREFIX,
  VFS_META_PREFIX,
} from "@/shared/virtualFileSystem";
import { storageNamespace, unnamespaceStorageKey } from "@/src/lib/keys";
import { normalizeStoredPath } from "@/src/lib/paths";
import { getStoredFilesForGame } from "@/src/lib/storage";
import type { GameRecord } from "@/src/lib/types";

export interface SaveExportEntry {
  path: string;
  data: string | Uint8Array;
}

export interface IndexedDbRecord {
  database: string;
  store: string;
  key: IDBValidKey;
  value: unknown;
}

type GameEngine =
  | "rpg-maker"
  | "wolf"
  | "tyrano"
  | "construct-2"
  | "cocos"
  | "unknown";

type StorageReader = Pick<Storage, "getItem" | "key" | "length">;
type DatabaseInfoFactory = IDBFactory & {
  databases?: () => Promise<Array<{ name?: string }>>;
};

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

function decodeVirtualFileValue(value: string): string | Uint8Array {
  if (!value.startsWith(VFS_BINARY_PREFIX)) return value;
  return bytesFromBase64(value.slice(VFS_BINARY_PREFIX.length));
}

function savePathForRpgKey(key: string): string | undefined {
  if (key === "RPG Config") return "save/config.rpgsave";
  if (key === "RPG Global") return "save/global.rpgsave";
  if (key === "RPG Shared") return "save/shared.rmmzsave";

  const mzSave = /^(?:_?localforage\/)?rmmzsave\.(.+)$/u.exec(key);
  if (mzSave) {
    const saveName = normalizeStoredPath(mzSave[1]);
    if (saveName) return `save/${saveName}.rmmzsave`;
  }

  const slot = /^RPG File(\d+)(bak)?$/u.exec(key);
  if (slot) {
    return `save/file${slot[1]}.rpgsave${slot[2] ? ".bak" : ""}`;
  }

  const customSave = /^RPG Save (.+)$/u.exec(key);
  if (customSave) {
    const customPath = normalizeStoredPath(customSave[1]);
    if (customPath) return `save/${customPath}`;
  }

  return undefined;
}

function savePathForConstructKey(key: string): string | undefined {
  const match = /^__c2save_(.+)$/u.exec(key);
  return match ? `save/${safePathSegment(match[1])}.json` : undefined;
}

function localStorageExportPath(key: string): string {
  return `localStorage/${encodeURIComponent(key)}.txt`;
}

function exportPathForStorageKey(key: string): string | undefined {
  if (
    key.startsWith(VFS_DIR_PREFIX) ||
    key.startsWith(VFS_META_PREFIX) ||
    key.startsWith(INDEXED_DB_MARKER_PREFIX)
  ) {
    return undefined;
  }
  if (key.startsWith(VFS_FILE_PREFIX)) {
    return normalizeStoredPath(key.slice(VFS_FILE_PREFIX.length));
  }
  return (
    savePathForRpgKey(key) ??
    savePathForConstructKey(key) ??
    localStorageExportPath(key)
  );
}

function exportDataForStorageValue(
  key: string,
  value: string,
): string | Uint8Array {
  return key.startsWith(VFS_FILE_PREFIX)
    ? decodeVirtualFileValue(value)
    : value;
}

export function collectSaveExportEntries(
  gameId: string,
  storage: StorageReader = window.localStorage,
): SaveExportEntry[] {
  const entries = new Map<string, SaveExportEntry>();

  for (let index = 0; index < storage.length; index += 1) {
    const rawKey = storage.key(index);
    if (!rawKey) continue;

    const key = unnamespaceStorageKey(gameId, rawKey);
    if (key === rawKey) continue;

    const path = exportPathForStorageKey(key);
    if (!path) continue;

    const value = storage.getItem(rawKey);
    if (value === null) continue;
    entries.set(path, {
      path,
      data: exportDataForStorageValue(key, value),
    });
  }

  return Array.from(entries.values()).sort((a, b) =>
    a.path.localeCompare(b.path),
  );
}

function trackedIndexedDbNames(
  gameId: string,
  storage: StorageReader,
): Set<string> {
  const markerPrefix = trackedIndexedDbMarkerPrefix(storageNamespace(gameId));
  const names = new Set<string>();

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(markerPrefix)) continue;
    try {
      names.add(decodeURIComponent(key.slice(markerPrefix.length)));
    } catch {
      // Ignore a malformed marker rather than blocking the remaining saves.
    }
  }

  return names;
}

async function detectGameEngine(gameId: string): Promise<GameEngine> {
  const paths = (await getStoredFilesForGame(gameId)).map((record) =>
    normalizeStoredPath(record.path).toLowerCase(),
  );
  const hasPath = (name: string) =>
    paths.some((path) => path === name || path.endsWith(`/${name}`));

  if (
    hasPath("woditor.js") &&
    hasPath("woditor.wasm") &&
    (hasPath("data.wolf") || hasPath("asset_manifest.json"))
  ) {
    return "wolf";
  }
  if (hasPath("c2runtime.js")) return "construct-2";
  if (hasPath("tyrano/tyrano.js") || hasPath("data/system/config.tjs")) {
    return "tyrano";
  }
  if (
    hasPath("js/rpg_core.js") ||
    hasPath("js/rmmz_core.js") ||
    hasPath("data/system.json")
  ) {
    return "rpg-maker";
  }
  if (
    hasPath("application.js") ||
    paths.some((path) => path.includes("cocos-js/"))
  ) {
    return "cocos";
  }
  return "unknown";
}

async function availableIndexedDbNames(
  factory: IDBFactory,
): Promise<Set<string>> {
  const enumerate = (factory as DatabaseInfoFactory).databases;
  if (typeof enumerate !== "function") return new Set();

  try {
    const databases = await enumerate.call(factory);
    return new Set(
      databases
        .map((database) => database.name)
        .filter((name): name is string => Boolean(name)),
    );
  } catch {
    return new Set();
  }
}

async function indexedDbNamesForGame(
  gameId: string,
  engine: GameEngine,
  storage: StorageReader,
  factory: IDBFactory,
): Promise<string[]> {
  const names = trackedIndexedDbNames(gameId, storage);
  const available = await availableIndexedDbNames(factory);

  if (engine === "wolf") {
    for (const name of available) {
      if (name.includes(gameId) && name.endsWith("-Save")) names.add(name);
    }
    return Array.from(names)
      .filter((name) => name.endsWith("-Save"))
      .sort();
  }

  if (engine === "construct-2") {
    for (const name of ["_C2SaveStates", "localforage"]) {
      if (available.size === 0 || available.has(name)) names.add(name);
    }
  }

  if (
    engine === "rpg-maker" &&
    (available.size === 0 || available.has("localforage"))
  ) {
    names.add("localforage");
  }

  return Array.from(names).sort();
}

function openExistingDatabase(
  factory: IDBFactory,
  name: string,
): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    let created = false;
    const request = factory.open(name);
    request.onupgradeneeded = () => {
      created = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      if (created) {
        request.result.close();
        resolve(undefined);
        return;
      }
      resolve(request.result);
    };
    request.onerror = () => resolve(undefined);
  });
}

function readObjectStore(
  database: string,
  db: IDBDatabase,
  store: string,
): Promise<IndexedDbRecord[]> {
  return new Promise((resolve, reject) => {
    const records: IndexedDbRecord[] = [];
    const transaction = db.transaction(store, "readonly");
    const request = transaction.objectStore(store).openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      records.push({ database, store, key: cursor.key, value: cursor.value });
      cursor.continue();
    };
    request.onerror = () =>
      reject(request.error ?? new Error(`Could not read ${database}/${store}.`));
    transaction.oncomplete = () => resolve(records);
    transaction.onerror = () =>
      reject(
        transaction.error ?? new Error(`Could not read ${database}/${store}.`),
      );
    transaction.onabort = transaction.onerror;
  });
}

async function readIndexedDbRecords(
  factory: IDBFactory,
  name: string,
): Promise<IndexedDbRecord[]> {
  const db = await openExistingDatabase(factory, name);
  if (!db) return [];

  try {
    const stores = Array.from(db.objectStoreNames);
    const records = await Promise.all(
      stores.map((store) => readObjectStore(name, db, store)),
    );
    return records.flat();
  } finally {
    db.close();
  }
}

function bytesFromValue(value: unknown): Uint8Array | undefined {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return undefined;
}

function safePathSegment(value: string): string {
  const label = value.trim() || "entry";
  try {
    return encodeURIComponent(label).slice(0, 180);
  } catch {
    return encodeURIComponent(label.replace(/[\uD800-\uDFFF]/gu, "�")).slice(
      0,
      180,
    );
  }
}

function indexedDbKeyLabel(key: IDBValidKey): string {
  if (typeof key === "string" || typeof key === "number") return String(key);
  if (key instanceof Date) return key.toISOString();
  if (ArrayBuffer.isView(key)) {
    return bytesToBase64(
      new Uint8Array(key.buffer, key.byteOffset, key.byteLength),
    );
  }
  if (key instanceof ArrayBuffer) return bytesToBase64(new Uint8Array(key));
  return JSON.stringify(key);
}

function structuredJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const serialized = JSON.stringify(
    value,
    (_key, nested: unknown) => {
      if (typeof nested === "bigint") {
        return { type: "BigInt", value: nested.toString() };
      }
      const bytes = bytesFromValue(nested);
      if (bytes) {
        return {
          type:
            nested instanceof ArrayBuffer
              ? "ArrayBuffer"
              : nested?.constructor?.name ?? "TypedArray",
          base64: bytesToBase64(bytes),
        };
      }
      if (typeof nested === "object" && nested !== null) {
        if (seen.has(nested)) return "[Circular]";
        seen.add(nested);
      }
      if (nested instanceof Map) {
        return { type: "Map", entries: Array.from(nested.entries()) };
      }
      if (nested instanceof Set) {
        return { type: "Set", values: Array.from(nested.values()) };
      }
      return nested;
    },
    2,
  );
  return serialized ?? String(value);
}

function wolfSavePath(key: IDBValidKey): string | undefined {
  if (typeof key !== "string") return undefined;
  const normalized = normalizeStoredPath(key);
  const saveRoot = normalized.indexOf("-Save/");
  if (saveRoot < 0) return undefined;
  return normalizeStoredPath(normalized.slice(saveRoot + "-Save/".length));
}

async function genericIndexedDbData(
  value: unknown,
): Promise<{ data: string | Uint8Array; extension: string }> {
  if (value instanceof Blob) {
    return {
      data: new Uint8Array(await value.arrayBuffer()),
      extension: "bin",
    };
  }
  const bytes = bytesFromValue(value);
  if (bytes) return { data: bytes, extension: "bin" };
  if (typeof value === "string") return { data: value, extension: "txt" };
  return { data: structuredJson(value), extension: "json" };
}

export async function exportIndexedDbRecord(
  record: IndexedDbRecord,
): Promise<SaveExportEntry | undefined> {
  if (record.database.endsWith("-Save") && record.store === "FILE_DATA") {
    const contents =
      typeof record.value === "object" && record.value !== null
        ? bytesFromValue((record.value as { contents?: unknown }).contents)
        : undefined;
    const path = wolfSavePath(record.key);
    return contents && path ? { path, data: contents } : undefined;
  }

  if (record.database === "_C2SaveStates" && record.store === "saves") {
    const save = record.value as { data?: unknown; slot?: unknown };
    const slot = String(save?.slot ?? indexedDbKeyLabel(record.key));
    const data =
      typeof save?.data === "string"
        ? save.data
        : structuredJson(save?.data ?? record.value);
    return { path: `save/${safePathSegment(slot)}.json`, data };
  }

  if (
    record.database === "localforage" &&
    record.store === "keyvaluepairs" &&
    typeof record.key === "string"
  ) {
    const path = savePathForRpgKey(record.key);
    if (path) {
      const payload = await genericIndexedDbData(record.value);
      return { path, data: payload.data };
    }
  }

  const payload = await genericIndexedDbData(record.value);
  const path = [
    "indexedDB",
    safePathSegment(record.database),
    safePathSegment(record.store),
    `${safePathSegment(indexedDbKeyLabel(record.key))}.${payload.extension}`,
  ].join("/");
  return { path, data: payload.data };
}

async function collectIndexedDbSaveEntries(
  gameId: string,
  storage: StorageReader,
  factory: IDBFactory | undefined,
): Promise<SaveExportEntry[]> {
  if (!factory) return [];

  let engine: GameEngine = "unknown";
  try {
    engine = await detectGameEngine(gameId);
  } catch {
    // Tracked databases can still be exported if game-file metadata is unavailable.
  }
  const names = await indexedDbNamesForGame(gameId, engine, storage, factory);
  const records = (
    await Promise.all(
      names.map(async (name) => {
        try {
          return await readIndexedDbRecords(factory, name);
        } catch {
          return [];
        }
      }),
    )
  ).flat();
  const entries = await Promise.all(records.map(exportIndexedDbRecord));
  return entries.filter((entry): entry is SaveExportEntry => Boolean(entry));
}

function downloadFileName(title: string): string {
  const safeTitle =
    title
      .trim()
      .replace(/[\\/:*?"<>|]+/gu, "-")
      .replace(/\s+/gu, " ") || "game";
  return `${safeTitle}-saves.zip`;
}

export async function downloadSaveZip(game: GameRecord): Promise<void> {
  const localEntries = collectSaveExportEntries(game.id);
  const indexedDbEntries = await collectIndexedDbSaveEntries(
    game.id,
    window.localStorage,
    window.indexedDB,
  );
  const entries = new Map<string, SaveExportEntry>();
  for (const entry of [...localEntries, ...indexedDbEntries]) {
    entries.set(entry.path, entry);
  }
  if (entries.size === 0) throw new Error("No saves found for this game.");

  const zip = new JSZip();
  for (const entry of entries.values()) {
    zip.file(entry.path, entry.data);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = downloadFileName(game.title);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
