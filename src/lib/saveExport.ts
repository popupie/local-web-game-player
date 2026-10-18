import JSZip from "jszip";
import {
  INDEXED_DB_SCOPE_PREFIX,
  INDEXED_DB_MARKER_PREFIX,
  scopedIndexedDbName,
  trackedIndexedDbPhysicalName,
  trackedIndexedDbMarkerPrefix,
} from "@/shared/indexedDbSaveTracking";
import {
  VFS_BINARY_PREFIX,
  VFS_DIR_PREFIX,
  VFS_FILE_PREFIX,
  VFS_META_PREFIX,
} from "@/shared/virtualFileSystem";
import { storageNamespace, unnamespaceStorageKey } from "@/src/lib/keys";
import {
  CONSTRUCT2_SAVE_DATABASE,
  constructExportPathForStorageKey,
  isConstructIndexedDbRecord,
  isConstructIndexedDbSaveRecord,
  isConstructSaveDatabase,
} from "@/src/engines/construct2/save";
import { detectGameEngine } from "@/src/engines/detect";
import {
  RPG_MAKER_SAVE_DATABASE,
  isRpgMakerIndexedDbRecord,
  isRpgMakerIndexedDbSaveRecord,
  isRpgMakerSaveDatabase,
  rpgMakerExportPathForStorageKey,
} from "@/src/engines/rpgmaker_mvmz/save";
import {
  isWolfIndexedDbRecord,
  isWolfIndexedDbSaveRecord,
  isWolfSaveDatabase,
  wolfSaveRelativePath,
} from "@/src/engines/wolf/save";
import { normalizeStoredPath } from "@/src/lib/paths";
import type {
  GameEngine,
  IndexedDbRecord,
  SaveArchiveManifest,
  SaveExportEntry,
  SaveExportTarget,
  SerializedIndexedDbKey,
} from "@/src/lib/saveTypes";
import type { GameRecord } from "@/src/lib/types";

export { detectGameEngine };
export type {
  GameEngine,
  IndexedDbRecord,
  SaveArchiveManifest,
  SaveExportEntry,
  SaveExportTarget,
  SerializedIndexedDbKey,
} from "@/src/lib/saveTypes";

export const SAVE_ARCHIVE_MANIFEST_PATH = ".mz-player/backup.json";
export const LEGACY_SAVE_ARCHIVE_MANIFEST_PATH =
  "__mz_player_save_manifest.json";

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

function serializeIndexedDbKey(key: IDBValidKey): SerializedIndexedDbKey {
  if (typeof key === "string") return { type: "string", value: key };
  if (typeof key === "number") return { type: "number", value: key };
  if (key instanceof Date) return { type: "date", value: key.toISOString() };
  if (Array.isArray(key)) {
    return { type: "array", value: key.map(serializeIndexedDbKey) };
  }
  const bytes =
    key instanceof ArrayBuffer
      ? new Uint8Array(key)
      : new Uint8Array(key.buffer, key.byteOffset, key.byteLength);
  return { type: "binary", value: bytesToBase64(bytes) };
}

function decodeVirtualFileValue(value: string): string | Uint8Array {
  if (!value.startsWith(VFS_BINARY_PREFIX)) return value;
  return bytesFromBase64(value.slice(VFS_BINARY_PREFIX.length));
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
    rpgMakerExportPathForStorageKey(key) ??
    constructExportPathForStorageKey(key) ??
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
      target: key.startsWith(VFS_FILE_PREFIX)
        ? {
            kind: "vfs",
            path: normalizeStoredPath(key.slice(VFS_FILE_PREFIX.length)),
          }
        : { kind: "local-storage", key },
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

export async function indexedDbNamesForGame(
  gameId: string,
  engine: GameEngine,
  storage: StorageReader,
  factory: IDBFactory,
): Promise<string[]> {
  const names = trackedIndexedDbNames(gameId, storage);
  const available = await availableIndexedDbNames(factory);

  if (engine === "wolf") {
    for (const name of available) {
      if (
        !name.startsWith(INDEXED_DB_SCOPE_PREFIX) &&
        name.includes(gameId) &&
        isWolfSaveDatabase(name)
      ) {
        names.add(name);
      }
    }
    return Array.from(names)
      .filter(isWolfSaveDatabase)
      .sort();
  }

  if (engine === "construct-2") {
    if (
      available.size === 0 ||
      available.has(CONSTRUCT2_SAVE_DATABASE) ||
      available.has(
        scopedIndexedDbName(
          storageNamespace(gameId),
          CONSTRUCT2_SAVE_DATABASE,
        ),
      )
    ) {
      names.add(CONSTRUCT2_SAVE_DATABASE);
    }
    return Array.from(names)
      .filter(
        (name) =>
          isConstructSaveDatabase(name) ||
          name === RPG_MAKER_SAVE_DATABASE,
      )
      .sort();
  }

  if (engine === "rpg-maker") {
    if (
      available.size === 0 ||
      available.has(RPG_MAKER_SAVE_DATABASE) ||
      available.has(
        scopedIndexedDbName(
          storageNamespace(gameId),
          RPG_MAKER_SAVE_DATABASE,
        ),
      )
    ) {
      names.add(RPG_MAKER_SAVE_DATABASE);
    }
    return Array.from(names).filter(isRpgMakerSaveDatabase).sort();
  }

  return Array.from(names)
    .filter(
      (name) =>
        !isRpgMakerSaveDatabase(name) &&
        !isConstructSaveDatabase(name) &&
        !isWolfSaveDatabase(name),
    )
    .sort();
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
    const objectStore = transaction.objectStore(store);
    const request = objectStore.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      records.push({
        autoIncrement: objectStore.autoIncrement,
        database,
        indexes: Array.from(objectStore.indexNames, (name) => {
          const index = objectStore.index(name);
          return {
            name,
            keyPath: index.keyPath,
            multiEntry: index.multiEntry,
            unique: index.unique,
          };
        }),
        store,
        key: cursor.key,
        keyPath: objectStore.keyPath,
        value: cursor.value,
      });
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
  gameId: string,
  storage: Pick<Storage, "getItem">,
  logicalName: string,
): Promise<IndexedDbRecord[]> {
  const physicalName = trackedIndexedDbPhysicalName(
    storageNamespace(gameId),
    logicalName,
    storage,
  );
  const db = await openExistingDatabase(factory, physicalName);
  if (!db) return [];

  try {
    const stores = Array.from(db.objectStoreNames);
    const records = await Promise.all(
      stores.map((store) => readObjectStore(logicalName, db, store)),
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

export function isIndexedDbSaveRecord(
  engine: GameEngine,
  record: IndexedDbRecord,
): boolean {
  if (isRpgMakerIndexedDbRecord(record)) {
    return engine === "rpg-maker" && isRpgMakerIndexedDbSaveRecord(record);
  }
  if (isConstructIndexedDbRecord(record)) {
    return engine === "construct-2" && isConstructIndexedDbSaveRecord(record);
  }
  if (isWolfIndexedDbRecord(record)) {
    return engine === "wolf" && isWolfIndexedDbSaveRecord(record);
  }
  return true;
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
  const bytes = bytesFromValue(record.value);
  const target: SaveExportTarget = {
    kind: "indexeddb",
    database: record.database,
    store: record.store,
    key: serializeIndexedDbKey(record.key),
    autoIncrement: record.autoIncrement,
    indexes: record.indexes,
    keyPath: record.keyPath,
    valueType:
      record.value instanceof Blob
        ? "Blob"
        : record.value instanceof ArrayBuffer
          ? "ArrayBuffer"
          : bytes
            ? record.value?.constructor?.name ?? "Uint8Array"
            : typeof record.value === "string"
              ? "String"
              : "Json",
    mimeType: record.value instanceof Blob ? record.value.type : undefined,
  };

  if (isWolfIndexedDbRecord(record) && record.store === "FILE_DATA") {
    const contents =
      typeof record.value === "object" && record.value !== null
        ? bytesFromValue((record.value as { contents?: unknown }).contents)
        : undefined;
    const path =
      typeof record.key === "string"
        ? wolfSaveRelativePath(record.key)
        : undefined;
    return contents && path ? { path, data: contents, target } : undefined;
  }

  if (isConstructIndexedDbRecord(record) && record.store === "saves") {
    const save = record.value as { data?: unknown; slot?: unknown };
    const slot = String(save?.slot ?? indexedDbKeyLabel(record.key));
    const data =
      typeof save?.data === "string"
        ? save.data
        : structuredJson(save?.data ?? record.value);
    return { path: `save/${safePathSegment(slot)}.json`, data, target };
  }

  if (
    isRpgMakerIndexedDbRecord(record) &&
    record.store === "keyvaluepairs" &&
    typeof record.key === "string"
  ) {
    const path = rpgMakerExportPathForStorageKey(record.key);
    if (path) {
      const payload = await genericIndexedDbData(record.value);
      return { path, data: payload.data, target };
    }
  }

  const payload = await genericIndexedDbData(record.value);
  const path = [
    "indexedDB",
    safePathSegment(record.database),
    safePathSegment(record.store),
    `${safePathSegment(indexedDbKeyLabel(record.key))}.${payload.extension}`,
  ].join("/");
  return { path, data: payload.data, target };
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
          return await readIndexedDbRecords(factory, gameId, storage, name);
        } catch {
          return [];
        }
      }),
    )
  ).flat();
  const entries = await Promise.all(
    records
      .filter((record) => isIndexedDbSaveRecord(engine, record))
      .map(exportIndexedDbRecord),
  );
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

  let engine: GameEngine = "unknown";
  try {
    engine = await detectGameEngine(game.id);
  } catch {
    // The entry targets are sufficient when game metadata is temporarily unavailable.
  }
  const metadataEntries = Array.from(entries.values()).filter(
    (entry) =>
      entry.path.startsWith("indexedDB/") &&
      entry.target?.kind === "indexeddb",
  );
  if (metadataEntries.length > 0) {
    const manifest: SaveArchiveManifest = {
      format: "mz-browser-player-save-backup",
      version: 1,
      engine,
      entries: metadataEntries.map((entry) => ({
        path: entry.path,
        dataType: typeof entry.data === "string" ? "text" : "binary",
        target: entry.target,
      })),
    };
    zip.file(SAVE_ARCHIVE_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
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
