import JSZip from "jszip";
import {
  LEGACY_SAVE_ARCHIVE_MANIFEST_PATH,
  SAVE_ARCHIVE_MANIFEST_PATH,
  indexedDbNamesForGame,
} from "@/src/lib/saveExport";
import {
  VFS_BINARY_PREFIX,
  VFS_DIR_PREFIX,
  VFS_FILE_PREFIX,
  VFS_META_PREFIX,
} from "@/shared/virtualFileSystem";
import {
  INDEXED_DB_MARKER_PREFIX,
  trackedIndexedDbPhysicalName,
  trackedIndexedDbMarkerKey,
} from "@/shared/indexedDbSaveTracking";
import { storageNamespace } from "@/src/lib/keys";
import { normalizeStoredPath } from "@/src/lib/paths";
import { cocosIndexedDbWritesForImport } from "@/src/engines/cocos/save";
import {
  constructIndexedDbWriteForImport,
  constructSlotForImportPath,
  isConstructSaveDatabase,
} from "@/src/engines/construct2/save";
import { detectGameEngine } from "@/src/engines/detect";
import {
  RPG_MAKER_SAVE_DATABASE,
  isRpgMakerSaveDatabase,
  rpgMakerIndexedDbKeyForImport,
  rpgMakerLocalStorageKeyForImport,
} from "@/src/engines/rpgmaker_mvmz/save";
import { tyranoLocalStorageEntryForImport } from "@/src/engines/tyrano/save";
import {
  deriveWolfDatabaseName,
  isWolfSaveDatabase,
  wolfIndexedDbWritesForImport,
  wolfSaveRelativePath,
} from "@/src/engines/wolf/save";
import type {
  GameEngine,
  IndexedDbWrite,
  SaveArchiveManifest,
  SaveExportTarget,
  SerializedIndexedDbKey,
  StoreIndexSpec,
} from "@/src/lib/saveTypes";
import type { GameRecord } from "@/src/lib/types";

const MAX_SAVE_ENTRY_COUNT = 10_000;
const MAX_SAVE_ARCHIVE_BYTES = 256 * 1024 * 1024;

type DataType = "text" | "binary";

interface LoadedSaveEntry {
  path: string;
  bytes: Uint8Array;
  dataType?: DataType;
  singleFile?: boolean;
  target?: SaveExportTarget;
}

type SaveInputFile = File & { webkitRelativePath?: string };

interface StoreSpec {
  autoIncrement?: boolean;
  indexes?: StoreIndexSpec[];
  name: string;
  keyPath?: string | string[] | null;
  timestampIndex?: boolean;
}

export interface SaveImportResult {
  cancelled?: boolean;
  importedEntries: number;
}

export interface SaveImportOptions {
  beforeCommit?: () => void | Promise<void>;
  confirmOverwrite?: (collisionCount: number) => boolean | Promise<boolean>;
  factory?: IDBFactory;
  storage?: Storage;
}

class BufferedStorage implements Storage {
  private readonly changes = new Map<string, string | null>();
  private cleared = false;

  constructor(private readonly target: Storage) {}

  get length(): number {
    return this.keys().length;
  }

  clear(): void {
    this.cleared = true;
    this.changes.clear();
  }

  getItem(key: string): string | null {
    if (this.changes.has(key)) return this.changes.get(key) ?? null;
    return this.cleared ? null : this.target.getItem(key);
  }

  key(index: number): string | null {
    return this.keys()[index] ?? null;
  }

  removeItem(key: string): void {
    this.changes.set(key, null);
  }

  setItem(key: string, value: string): void {
    this.changes.set(key, String(value));
  }

  collisionCount(gameId: string): number {
    const prefix = storageNamespace(gameId);
    let count = 0;
    for (const [key, value] of this.changes) {
      if (
        value === null ||
        !key.startsWith(prefix) ||
        this.target.getItem(key) === null
      ) {
        continue;
      }
      const localKey = key.slice(prefix.length);
      if (
        localKey.startsWith(VFS_DIR_PREFIX) ||
        localKey.startsWith(VFS_META_PREFIX) ||
        localKey.startsWith(INDEXED_DB_MARKER_PREFIX)
      ) {
        continue;
      }
      count += 1;
    }
    return count;
  }

  flush(): void {
    if (this.cleared) this.target.clear();
    for (const [key, value] of this.changes) {
      if (value === null) this.target.removeItem(key);
      else this.target.setItem(key, value);
    }
  }

  private keys(): string[] {
    const keys = new Set<string>();
    if (!this.cleared) {
      for (let index = 0; index < this.target.length; index += 1) {
        const key = this.target.key(index);
        if (key) keys.add(key);
      }
    }
    for (const [key, value] of this.changes) {
      if (value === null) keys.delete(key);
      else keys.add(key);
    }
    return Array.from(keys);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function textFromBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function typedArrayFromBytes(
  name: string,
  bytes: Uint8Array,
): ArrayBufferView | undefined {
  const typedArrays: Record<
    string,
    new (buffer: ArrayBuffer) => ArrayBufferView
  > = {
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
    DataView,
  };
  const Constructor = typedArrays[name];
  return Constructor ? new Constructor(arrayBufferFromBytes(bytes)) : undefined;
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`Invalid encoded save path: ${value}`);
  }
}

function deserializeIndexedDbKey(key: SerializedIndexedDbKey): IDBValidKey {
  if (key.type === "string" || key.type === "number") return key.value;
  if (key.type === "date") return new Date(key.value);
  if (key.type === "array") return key.value.map(deserializeIndexedDbKey);
  const bytes = bytesFromBase64(key.value);
  return arrayBufferFromBytes(bytes);
}

function reviveStructuredValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveStructuredValue);
  if (typeof value !== "object" || value === null) return value;

  const record = value as Record<string, unknown>;
  if (record.type === "BigInt" && typeof record.value === "string") {
    return BigInt(record.value);
  }
  if (
    typeof record.type === "string" &&
    typeof record.base64 === "string"
  ) {
    const bytes = bytesFromBase64(record.base64);
    if (record.type === "ArrayBuffer") {
      return arrayBufferFromBytes(bytes);
    }
    return typedArrayFromBytes(record.type, bytes) ?? bytes;
  }
  if (record.type === "Map" && Array.isArray(record.entries)) {
    return new Map(
      record.entries.map((entry) => {
        const pair = entry as [unknown, unknown];
        return [reviveStructuredValue(pair[0]), reviveStructuredValue(pair[1])];
      }),
    );
  }
  if (record.type === "Set" && Array.isArray(record.values)) {
    return new Set(record.values.map(reviveStructuredValue));
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, nested]) => [
      key,
      reviveStructuredValue(nested),
    ]),
  );
}

function genericIndexedDbValue(
  entry: LoadedSaveEntry,
  target: Extract<SaveExportTarget, { kind: "indexeddb" }>,
): unknown {
  if (target.valueType === "Blob") {
    return new Blob([arrayBufferFromBytes(entry.bytes)], {
      type: target.mimeType,
    });
  }
  if (target.valueType === "ArrayBuffer") {
    return arrayBufferFromBytes(entry.bytes);
  }
  if (target.valueType && target.valueType !== "String" && target.valueType !== "Json") {
    const typed = typedArrayFromBytes(target.valueType, entry.bytes);
    if (typed) return typed;
  }
  const extension = entry.path.split(".").at(-1)?.toLowerCase();
  if (extension === "bin" || entry.dataType === "binary") return entry.bytes;
  const text = textFromBytes(entry.bytes);
  if (extension !== "json") return text;
  try {
    return reviveStructuredValue(JSON.parse(text));
  } catch {
    throw new Error(`Invalid IndexedDB JSON save: ${entry.path}`);
  }
}

function parseManifest(value: string): SaveArchiveManifest | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<SaveArchiveManifest>;
    if (
      parsed.format !== "mz-browser-player-save-backup" ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.entries)
    ) {
      return undefined;
    }
    return parsed as SaveArchiveManifest;
  } catch {
    throw new Error("The save backup manifest is invalid.");
  }
}

async function loadSaveArchive(file: File): Promise<{
  entries: LoadedSaveEntry[];
  manifest?: SaveArchiveManifest;
}> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile =
    zip.file(SAVE_ARCHIVE_MANIFEST_PATH) ??
    zip.file(LEGACY_SAVE_ARCHIVE_MANIFEST_PATH);
  const manifest = manifestFile
    ? parseManifest(await manifestFile.async("string"))
    : undefined;
  const manifestEntries = new Map(
    manifest?.entries.map((entry) => [normalizeStoredPath(entry.path), entry]),
  );
  const files = Object.values(zip.files).filter((entry) => {
    const path = normalizeStoredPath(entry.name);
    return (
      !entry.dir &&
      path !== SAVE_ARCHIVE_MANIFEST_PATH &&
      path !== LEGACY_SAVE_ARCHIVE_MANIFEST_PATH &&
      !path.startsWith("__MACOSX/") &&
      !path.endsWith("/.DS_Store") &&
      path !== ".DS_Store"
    );
  });
  if (files.length === 0) throw new Error("This ZIP contains no save files.");
  if (files.length > MAX_SAVE_ENTRY_COUNT) {
    throw new Error("This save ZIP contains too many files.");
  }
  const archivePaths = files.map((entry) => normalizeStoredPath(entry.name));
  const importPaths = manifest
    ? archivePaths
    : normalizeSaveEntryPaths(archivePaths);

  let totalBytes = 0;
  const entries: LoadedSaveEntry[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const fileEntry = files[index];
    const path = importPaths[index];
    if (!path) continue;
    const bytes = await fileEntry.async("uint8array");
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_SAVE_ARCHIVE_BYTES) {
      throw new Error("This save ZIP is larger than the 256 MB import limit.");
    }
    const metadata = manifestEntries.get(path);
    entries.push({
      path,
      bytes,
      dataType: metadata?.dataType,
      target: metadata?.target,
    });
  }
  if (entries.length === 0) throw new Error("This ZIP contains no save files.");
  return { entries, manifest };
}

function normalizeSaveEntryPaths(paths: string[]): string[] {
  const roots = paths.map((path) => {
    const separator = path.indexOf("/");
    return separator > 0 ? path.slice(0, separator) : undefined;
  });
  const commonRoot =
    roots.length > 0 &&
    roots.every((root) => root !== undefined && root === roots[0])
      ? roots[0]
      : undefined;
  const normalizedRoot = commonRoot?.toLowerCase();
  const preserveSaveRoot =
    normalizedRoot === "save" ||
    normalizedRoot === "localstorage" ||
    normalizedRoot === "indexeddb" ||
    normalizedRoot?.endsWith("-save");

  return paths.map((path) =>
    commonRoot && !preserveSaveRoot && path.startsWith(`${commonRoot}/`)
      ? path.slice(commonRoot.length + 1)
      : path,
  );
}

function relativeSavePaths(files: File[]): Array<{
  file: File;
  path: string;
}> {
  const paths = files.map((file) => {
    const relativePath = (file as SaveInputFile).webkitRelativePath;
    return {
      file,
      path: normalizeStoredPath(relativePath || file.name),
      hasRelativePath: Boolean(relativePath),
    };
  });
  const normalizedPaths = paths.every((entry) => entry.hasRelativePath)
    ? normalizeSaveEntryPaths(paths.map((entry) => entry.path))
    : paths.map((entry) => entry.path);

  return paths.map(({ file }, index) => ({
    file,
    path: normalizedPaths[index],
  }));
}

async function loadSaveFolder(files: File[]): Promise<{
  entries: LoadedSaveEntry[];
  manifest?: SaveArchiveManifest;
}> {
  const folderEntries = relativeSavePaths(files);
  const manifestEntry = folderEntries.find(
    (entry) =>
      entry.path === SAVE_ARCHIVE_MANIFEST_PATH ||
      entry.path === LEGACY_SAVE_ARCHIVE_MANIFEST_PATH,
  );
  const manifest = manifestEntry
    ? parseManifest(textFromBytes(await fileBytes(manifestEntry.file)))
    : undefined;
  const manifestEntries = new Map(
    manifest?.entries.map((entry) => [normalizeStoredPath(entry.path), entry]),
  );
  const saveFiles = folderEntries.filter(
    (entry) =>
      entry.path &&
      entry.path !== SAVE_ARCHIVE_MANIFEST_PATH &&
      entry.path !== LEGACY_SAVE_ARCHIVE_MANIFEST_PATH &&
      !entry.path.startsWith("__MACOSX/") &&
      !entry.path.endsWith("/.DS_Store") &&
      entry.path !== ".DS_Store",
  );
  if (saveFiles.length === 0) {
    throw new Error("This folder contains no save files.");
  }
  if (saveFiles.length > MAX_SAVE_ENTRY_COUNT) {
    throw new Error("This save folder contains too many files.");
  }

  let totalBytes = 0;
  const entries: LoadedSaveEntry[] = [];
  for (const { file, path } of saveFiles) {
    const bytes = await fileBytes(file);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_SAVE_ARCHIVE_BYTES) {
      throw new Error("This save folder is larger than the 256 MB import limit.");
    }
    const metadata = manifestEntries.get(path);
    entries.push({
      path,
      bytes,
      dataType: metadata?.dataType,
      target: metadata?.target,
    });
  }
  return { entries, manifest };
}

async function fileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Uint8Array(file as unknown as ArrayBufferLike);
}

async function hasZipSignature(file: File): Promise<boolean> {
  const bytes = await fileBytes(file);
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

async function loadSaveInput(file: File): Promise<{
  entries: LoadedSaveEntry[];
  manifest?: SaveArchiveManifest;
}> {
  const fileName = file.name || "save.dat";
  const isZip =
    fileName.toLowerCase().endsWith(".zip") || (await hasZipSignature(file));
  if (isZip) return loadSaveArchive(file);

  const bytes = await fileBytes(file);
  if (bytes.byteLength === 0) throw new Error("The selected save file is empty.");
  if (bytes.byteLength > MAX_SAVE_ARCHIVE_BYTES) {
    throw new Error("This save file is larger than the 256 MB import limit.");
  }
  const path = normalizeStoredPath(fileName).split("/").at(-1);
  if (!path) throw new Error("The selected save file has an invalid name.");
  return { entries: [{ path, bytes, singleFile: true }] };
}

function importPathForEngine(
  engine: GameEngine,
  entry: LoadedSaveEntry,
): string {
  if (!entry.singleFile) return entry.path;
  if (engine === "wolf") return `Save/${entry.path}`;
  if (engine === "rpg-maker" || engine === "construct-2") {
    return `save/${entry.path}`;
  }
  return entry.path;
}

function storeVirtualFile(
  gameId: string,
  path: string,
  bytes: Uint8Array,
  dataType: DataType | undefined,
  storage: Storage,
): void {
  const normalized = normalizeStoredPath(path);
  if (!normalized) throw new Error("A save file has an invalid path.");
  const prefix = storageNamespace(gameId);
  const now = Date.now();
  const value =
    dataType === "text"
      ? textFromBytes(bytes)
      : `${VFS_BINARY_PREFIX}${bytesToBase64(bytes)}`;
  storage.setItem(`${prefix}${VFS_FILE_PREFIX}${normalized}`, value);
  storage.setItem(
    `${prefix}${VFS_META_PREFIX}${normalized}`,
    JSON.stringify({ birthtimeMs: now, isDirectory: false, mtimeMs: now }),
  );

  const parts = normalized.split("/");
  parts.pop();
  while (parts.length > 0) {
    const directory = parts.join("/");
    storage.setItem(`${prefix}${VFS_DIR_PREFIX}${directory}`, "1");
    storage.setItem(
      `${prefix}${VFS_META_PREFIX}${directory}`,
      JSON.stringify({ birthtimeMs: now, isDirectory: true, mtimeMs: now }),
    );
    parts.pop();
  }
}

function indexedDbTargetFromPath(
  path: string,
): Extract<SaveExportTarget, { kind: "indexeddb" }> | undefined {
  const match = /^indexedDB\/([^/]+)\/([^/]+)\/([^/]+)\.(?:txt|json|bin)$/u.exec(
    path,
  );
  if (!match) return undefined;
  return {
    kind: "indexeddb",
    database: decodePathSegment(match[1]),
    store: decodePathSegment(match[2]),
    key: { type: "string", value: decodePathSegment(match[3]) },
  };
}

async function wolfDatabaseName(
  gameId: string,
  factory: IDBFactory,
  storage: Storage,
  targetDatabase?: string,
): Promise<string> {
  const names = await indexedDbNamesForGame(
    gameId,
    "wolf",
    storage,
    factory,
  );
  const existing = names.find((name) => name.includes(gameId));
  if (existing) return existing;
  if (
    targetDatabase?.includes(gameId) &&
    isWolfSaveDatabase(targetDatabase)
  ) {
    return targetDatabase;
  }
  const transferableTarget =
    /^\/data0\/[0-9a-f-]{36}(_.+-Save)$/iu.exec(targetDatabase ?? "");
  if (transferableTarget) {
    return `/data0/${gameId}${transferableTarget[1]}`;
  }
  return deriveWolfDatabaseName(gameId);
}

function storeSpecSatisfied(db: IDBDatabase, spec: StoreSpec): boolean {
  if (!db.objectStoreNames.contains(spec.name)) return false;
  const transaction = db.transaction(spec.name, "readonly");
  const store = transaction.objectStore(spec.name);
  if (spec.timestampIndex && !store.indexNames.contains("timestamp")) {
    return false;
  }
  return (spec.indexes ?? []).every((index) =>
    store.indexNames.contains(index.name),
  );
}

function createOrUpgradeStores(
  request: IDBOpenDBRequest,
  specs: StoreSpec[],
): void {
  const db = request.result;
  const transaction = request.transaction;
  if (!transaction) return;
  for (const spec of specs) {
    const store = db.objectStoreNames.contains(spec.name)
      ? transaction.objectStore(spec.name)
      : db.createObjectStore(
          spec.name,
          spec.keyPath !== undefined && spec.keyPath !== null
            ? { keyPath: spec.keyPath, autoIncrement: spec.autoIncrement }
            : { autoIncrement: spec.autoIncrement },
        );
    if (spec.timestampIndex && !store.indexNames.contains("timestamp")) {
      store.createIndex("timestamp", "timestamp", { unique: false });
    }
    for (const index of spec.indexes ?? []) {
      if (store.indexNames.contains(index.name)) continue;
      store.createIndex(index.name, index.keyPath, {
        multiEntry: index.multiEntry,
        unique: index.unique,
      });
    }
  }
}

function openDatabase(
  factory: IDBFactory,
  name: string,
  specs: StoreSpec[],
  version?: number,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request =
      version === undefined ? factory.open(name) : factory.open(name, version);
    request.onupgradeneeded = () => createOrUpgradeStores(request, specs);
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error(`Could not open ${name}.`));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error("Close the running game before importing its saves."));
    };
  });
}

async function openWritableDatabase(
  factory: IDBFactory,
  name: string,
  specs: StoreSpec[],
): Promise<IDBDatabase> {
  let db = await openDatabase(factory, name, specs);
  if (specs.every((spec) => storeSpecSatisfied(db, spec))) return db;
  const nextVersion = db.version + 1;
  db.close();
  db = await openDatabase(factory, name, specs, nextVersion);
  return db;
}

function openExistingDatabase(
  factory: IDBFactory,
  name: string,
): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    let created = false;
    let settled = false;
    const finish = (database?: IDBDatabase) => {
      if (settled) {
        database?.close();
        return;
      }
      settled = true;
      resolve(database);
    };
    const request = factory.open(name);
    request.onupgradeneeded = () => {
      created = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      if (created) {
        request.result.close();
        finish();
        return;
      }
      finish(request.result);
    };
    request.onerror = () => finish();
    request.onblocked = () => finish();
  });
}

function indexedDbKeyExists(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<boolean> {
  if (!database.objectStoreNames.contains(storeName)) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getKey(key);
    request.onsuccess = () => resolve(request.result !== undefined);
    request.onerror = () => resolve(false);
    transaction.onabort = () => resolve(false);
  });
}

async function indexedDbCollisionCount(
  gameId: string,
  writes: IndexedDbWrite[],
  factory: IDBFactory,
  storage: Pick<Storage, "getItem">,
): Promise<number> {
  const writesByDatabase = new Map<string, IndexedDbWrite[]>();
  for (const write of writes) {
    const group = writesByDatabase.get(write.database) ?? [];
    group.push(write);
    writesByDatabase.set(write.database, group);
  }

  let count = 0;
  for (const [databaseName, databaseWrites] of writesByDatabase) {
    const physicalName = trackedIndexedDbPhysicalName(
      storageNamespace(gameId),
      databaseName,
      storage,
    );
    const database = await openExistingDatabase(factory, physicalName);
    if (!database) continue;
    try {
      for (const write of databaseWrites) {
        if (await indexedDbKeyExists(database, write.store, write.key)) {
          count += 1;
        }
      }
    } finally {
      database.close();
    }
  }
  return count;
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Save import transaction failed."));
    transaction.onabort = transaction.onerror;
  });
}

async function commitIndexedDbWrites(
  gameId: string,
  writes: IndexedDbWrite[],
  factory: IDBFactory,
  storage: Storage,
): Promise<void> {
  const writesByDatabase = new Map<string, IndexedDbWrite[]>();
  for (const write of writes) {
    const group = writesByDatabase.get(write.database) ?? [];
    group.push(write);
    writesByDatabase.set(write.database, group);
  }

  for (const [databaseName, databaseWrites] of writesByDatabase) {
    if (databaseName === "mvmz-browser-player") {
      throw new Error("The save ZIP targets protected player storage.");
    }
    const specs = Array.from(
      new Map(
        databaseWrites.map((write) => [
          write.store,
          {
            autoIncrement: write.autoIncrement,
            indexes: write.indexes,
            name: write.store,
            keyPath: write.keyPath,
            timestampIndex: write.timestampIndex,
          } satisfies StoreSpec,
        ]),
      ).values(),
    );
    const physicalName = trackedIndexedDbPhysicalName(
      storageNamespace(gameId),
      databaseName,
      storage,
    );
    const db = await openWritableDatabase(factory, physicalName, specs);
    try {
      const transaction = db.transaction(
        specs.map((spec) => spec.name),
        "readwrite",
      );
      for (const write of databaseWrites) {
        const store = transaction.objectStore(write.store);
        if (store.keyPath === null) store.put(write.value, write.key);
        else store.put(write.value);
      }
      await transactionDone(transaction);
    } finally {
      db.close();
    }
    storage.setItem(
      trackedIndexedDbMarkerKey(storageNamespace(gameId), databaseName),
      physicalName,
    );
  }
}

function genericWrite(
  target: Extract<SaveExportTarget, { kind: "indexeddb" }>,
  entry: LoadedSaveEntry,
): IndexedDbWrite {
  return {
    database: target.database,
    store: target.store,
    key: deserializeIndexedDbKey(target.key),
    autoIncrement: target.autoIncrement,
    indexes: target.indexes,
    keyPath: target.keyPath,
    value: genericIndexedDbValue(entry, target),
  };
}

async function collectImportWrites(
  game: GameRecord,
  engine: GameEngine,
  entries: LoadedSaveEntry[],
  factory: IDBFactory,
  storage: Storage,
): Promise<IndexedDbWrite[]> {
  const prefix = storageNamespace(game.id);
  const indexedDbWrites: IndexedDbWrite[] = [];
  const cocosDirectoryKeys = new Set<string>();
  let resolvedWolfDatabase: string | undefined;

  for (const entry of entries) {
    const importPath = importPathForEngine(engine, entry);
    const exactTarget = entry.target;
    if (exactTarget?.kind === "local-storage") {
      storage.setItem(`${prefix}${exactTarget.key}`, textFromBytes(entry.bytes));
      const mvKey = rpgMakerLocalStorageKeyForImport(importPath);
      const mzKey = rpgMakerIndexedDbKeyForImport(importPath);
      if (engine === "rpg-maker" && (mvKey || mzKey)) {
        storeVirtualFile(
          game.id,
          importPath,
          entry.bytes,
          entry.dataType,
          storage,
        );
        if (mzKey) {
          indexedDbWrites.push({
            database: RPG_MAKER_SAVE_DATABASE,
            store: "keyvaluepairs",
            key: mzKey,
            value: textFromBytes(entry.bytes),
          });
        }
      }
      const localConstructSlot =
        engine === "construct-2"
          ? constructSlotForImportPath(importPath)
          : undefined;
      if (localConstructSlot) {
        indexedDbWrites.push(
          constructIndexedDbWriteForImport(
            localConstructSlot,
            textFromBytes(entry.bytes),
          ),
        );
      }
      continue;
    }
    if (exactTarget?.kind === "vfs") {
      storeVirtualFile(
        game.id,
        exactTarget.path,
        entry.bytes,
        entry.dataType,
        storage,
      );
      if (engine === "rpg-maker") {
        const mvKey = rpgMakerLocalStorageKeyForImport(importPath);
        const mzKey = rpgMakerIndexedDbKeyForImport(importPath);
        if (mvKey) {
          storage.setItem(`${prefix}${mvKey}`, textFromBytes(entry.bytes));
        }
        if (mzKey) {
          indexedDbWrites.push({
            database: RPG_MAKER_SAVE_DATABASE,
            store: "keyvaluepairs",
            key: mzKey,
            value: textFromBytes(entry.bytes),
          });
        }
      }
      continue;
    }

    const localStorageMatch = /^localStorage\/(.+)\.txt$/iu.exec(importPath);
    if (localStorageMatch) {
      const storageKey = decodePathSegment(localStorageMatch[1]);
      storage.setItem(`${prefix}${storageKey}`, textFromBytes(entry.bytes));
      storage.removeItem(`${prefix}${VFS_FILE_PREFIX}${storageKey}.txt`);
      storage.removeItem(`${prefix}${VFS_META_PREFIX}${storageKey}.txt`);
      continue;
    }

    const indexedTarget =
      exactTarget?.kind === "indexeddb"
        ? exactTarget
        : indexedDbTargetFromPath(importPath);
    const wolfPath = wolfSaveRelativePath(importPath);
    const isWolfEntry =
      engine === "wolf" &&
      (wolfPath ||
        (indexedTarget &&
          isWolfSaveDatabase(indexedTarget.database) &&
          indexedTarget.store === "FILE_DATA"));
    if (isWolfEntry) {
      const relativePath = wolfPath ?? wolfSaveRelativePath(String(
        indexedTarget && deserializeIndexedDbKey(indexedTarget.key),
      ));
      if (!relativePath) throw new Error(`Invalid WOLF save path: ${importPath}`);
      resolvedWolfDatabase ??= await wolfDatabaseName(
        game.id,
        factory,
        storage,
        indexedTarget?.database,
      );
      indexedDbWrites.push(
        ...wolfIndexedDbWritesForImport(
          resolvedWolfDatabase,
          relativePath,
          entry.bytes,
        ),
      );
      continue;
    }

    if (
      indexedTarget &&
      isConstructSaveDatabase(indexedTarget.database) &&
      indexedTarget.store === "saves"
    ) {
      const slot = String(deserializeIndexedDbKey(indexedTarget.key));
      indexedDbWrites.push(
        constructIndexedDbWriteForImport(slot, textFromBytes(entry.bytes)),
      );
      storage.setItem(`${prefix}__c2save_${slot}`, textFromBytes(entry.bytes));
      continue;
    }

    if (
      indexedTarget &&
      isRpgMakerSaveDatabase(indexedTarget.database) &&
      indexedTarget.store === "keyvaluepairs"
    ) {
      if (
        engine === "rpg-maker" &&
        rpgMakerIndexedDbKeyForImport(importPath)
      ) {
        storeVirtualFile(
          game.id,
          importPath,
          entry.bytes,
          entry.dataType,
          storage,
        );
      }
      indexedDbWrites.push({
        database: RPG_MAKER_SAVE_DATABASE,
        store: "keyvaluepairs",
        key: deserializeIndexedDbKey(indexedTarget.key),
        value:
          entry.dataType === "binary"
            ? entry.bytes
            : textFromBytes(entry.bytes),
      });
      continue;
    }

    if (indexedTarget) {
      indexedDbWrites.push(genericWrite(indexedTarget, entry));
      continue;
    }

    if (engine === "tyrano") {
      const tyranoEntry = tyranoLocalStorageEntryForImport(
        importPath,
        textFromBytes(entry.bytes),
      );
      if (tyranoEntry) {
        storage.setItem(`${prefix}${tyranoEntry.key}`, tyranoEntry.value);
        continue;
      }
    }

    if (engine === "cocos") {
      indexedDbWrites.push(
        ...cocosIndexedDbWritesForImport(
          importPath,
          entry.bytes,
          cocosDirectoryKeys,
        ),
      );
      continue;
    }

    const mvKey = rpgMakerLocalStorageKeyForImport(importPath);
    const mzKey = rpgMakerIndexedDbKeyForImport(importPath);
    if (engine === "rpg-maker" && (mvKey || mzKey)) {
      storeVirtualFile(game.id, importPath, entry.bytes, entry.dataType, storage);
      if (mvKey) storage.setItem(`${prefix}${mvKey}`, textFromBytes(entry.bytes));
      if (mzKey) {
        indexedDbWrites.push({
          database: RPG_MAKER_SAVE_DATABASE,
          store: "keyvaluepairs",
          key: mzKey,
          value: textFromBytes(entry.bytes),
        });
      }
      continue;
    }

    const slot =
      engine === "construct-2"
        ? constructSlotForImportPath(importPath)
        : undefined;
    if (slot) {
      const data = textFromBytes(entry.bytes);
      indexedDbWrites.push(constructIndexedDbWriteForImport(slot, data));
      storage.setItem(`${prefix}__c2save_${slot}`, data);
      continue;
    }

    storeVirtualFile(game.id, importPath, entry.bytes, entry.dataType, storage);
  }

  return indexedDbWrites;
}

async function importLoadedSaves(
  game: GameRecord,
  loaded: {
    entries: LoadedSaveEntry[];
    manifest?: SaveArchiveManifest;
  },
  options: SaveImportOptions = {},
): Promise<SaveImportResult> {
  const storage = options.storage ?? window.localStorage;
  const factory = options.factory ?? window.indexedDB;
  const { entries, manifest } = loaded;
  let engine = manifest?.engine ?? "unknown";
  try {
    const detectedEngine = await detectGameEngine(game.id);
    if (detectedEngine !== "unknown" || engine === "unknown") {
      engine = detectedEngine;
    }
  } catch {
    // A valid backup manifest still provides a safe fallback classification.
  }
  const bufferedStorage = new BufferedStorage(storage);
  const indexedDbWrites = await collectImportWrites(
    game,
    engine,
    entries,
    factory,
    bufferedStorage,
  );
  const collisionCount =
    bufferedStorage.collisionCount(game.id) +
    (await indexedDbCollisionCount(
      game.id,
      indexedDbWrites,
      factory,
      storage,
    ));
  if (
    collisionCount > 0 &&
    options.confirmOverwrite &&
    !(await options.confirmOverwrite(collisionCount))
  ) {
    return { cancelled: true, importedEntries: 0 };
  }
  await options.beforeCommit?.();
  bufferedStorage.flush();
  await commitIndexedDbWrites(game.id, indexedDbWrites, factory, storage);
  return { importedEntries: entries.length };
}

export async function importSaveFile(
  game: GameRecord,
  file: File,
  options: SaveImportOptions = {},
): Promise<SaveImportResult> {
  return importLoadedSaves(game, await loadSaveInput(file), options);
}

export async function importSaveFolder(
  game: GameRecord,
  files: File[],
  options: SaveImportOptions = {},
): Promise<SaveImportResult> {
  return importLoadedSaves(game, await loadSaveFolder(files), options);
}

export const importSaveZip = importSaveFile;
