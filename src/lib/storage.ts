import { detectMime } from "./mime";
import { normalizeStoredPath } from "./paths";
import type { GameRecord, StoredGameFile } from "./types";

const DB_NAME = "mvmz-browser-player";
const DB_VERSION = 2;
const GAME_STORE = "games";
const FILE_STORE = "files";
const BLOB_STORE = "blobs";
const HANDLE_STORE = "handles";
const DELETE_GAME_STORES = [GAME_STORE, FILE_STORE, BLOB_STORE, HANDLE_STORE] as const;

export type BrowserFileSystemPermissionMode = "read" | "readwrite";
export type BrowserFileSystemPermissionState = "granted" | "denied" | "prompt";

export type BrowserFileSystemDirectoryHandle = {
  kind?: "directory";
  name?: string;
  entries?: () => AsyncIterableIterator<[string, BrowserFileSystemDirectoryHandle | BrowserFileSystemFileHandle]>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<BrowserFileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<BrowserFileSystemFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  queryPermission?: (descriptor?: { mode?: BrowserFileSystemPermissionMode }) => Promise<BrowserFileSystemPermissionState>;
  requestPermission?: (descriptor?: { mode?: BrowserFileSystemPermissionMode }) => Promise<BrowserFileSystemPermissionState>;
};

export type BrowserFileSystemFileHandle = {
  kind?: "file";
  name?: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
};

type StoredBlobRecord = {
  key: string;
  blob: Blob;
};

type LocalFolderHandleRecord = {
  gameId: string;
  handle: BrowserFileSystemDirectoryHandle;
};

export function fileKey(gameId: string, path: string): string {
  return `${gameId}\n${normalizeStoredPath(path)}`;
}

export function normalizeGameRecord(game: GameRecord): GameRecord {
  return {
    ...game,
    sourceKind: game.sourceKind ?? "stored",
  };
}

export function gameStoreNamesDeletedWithGame(): readonly string[] {
  return DELETE_GAME_STORES;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

export async function openPlayerDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(GAME_STORE)) {
      db.createObjectStore(GAME_STORE, { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains(FILE_STORE)) {
      const store = db.createObjectStore(FILE_STORE, { keyPath: "key" });
      store.createIndex("gameId", "gameId", { unique: false });
    }
    if (!db.objectStoreNames.contains(BLOB_STORE)) {
      db.createObjectStore(BLOB_STORE, { keyPath: "key" });
    }
    if (!db.objectStoreNames.contains(HANDLE_STORE)) {
      db.createObjectStore(HANDLE_STORE, { keyPath: "gameId" });
    }
  };

  return requestToPromise(request);
}

export async function getAllGames(): Promise<GameRecord[]> {
  const db = await openPlayerDb();
  try {
    const transaction = db.transaction(GAME_STORE, "readonly");
    const games = await requestToPromise<GameRecord[]>(transaction.objectStore(GAME_STORE).getAll());
    return games.map(normalizeGameRecord).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    db.close();
  }
}

export async function getGame(gameId: string): Promise<GameRecord | undefined> {
  const db = await openPlayerDb();
  try {
    const transaction = db.transaction(GAME_STORE, "readonly");
    const game = await requestToPromise<GameRecord | undefined>(transaction.objectStore(GAME_STORE).get(gameId));
    return game ? normalizeGameRecord(game) : undefined;
  } finally {
    db.close();
  }
}

export async function putGame(game: GameRecord): Promise<void> {
  const db = await openPlayerDb();
  try {
    const transaction = db.transaction(GAME_STORE, "readwrite");
    transaction.objectStore(GAME_STORE).put(normalizeGameRecord(game));
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function updateGameSettings(game: GameRecord): Promise<void> {
  await putGame({ ...game, updatedAt: new Date().toISOString() });
}

export async function deleteGame(gameId: string): Promise<void> {
  const db = await openPlayerDb();
  try {
    const transaction = db.transaction([...DELETE_GAME_STORES], "readwrite");
    transaction.objectStore(GAME_STORE).delete(gameId);
    transaction.objectStore(HANDLE_STORE).delete(gameId);

    const fileIndex = transaction.objectStore(FILE_STORE).index("gameId");
    const fileRequest = fileIndex.openCursor(IDBKeyRange.only(gameId));
    fileRequest.onsuccess = () => {
      const cursor = fileRequest.result;
      if (!cursor) return;
      const record = cursor.value as StoredGameFile & { key: string };
      transaction.objectStore(BLOB_STORE).delete(record.key);
      cursor.delete();
      cursor.continue();
    };

    await transactionDone(transaction);
  } finally {
    db.close();
  }

  await removeOpfsGame(gameId);
}

export async function clearPlayerStorage(): Promise<void> {
  await deletePlayerDb();
  await removeOpfsGames();
}

function deletePlayerDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    const timeoutId = globalThis.setTimeout(() => {
      reject(
        new Error(
          "Storage is still open in another tab. Close other Local Web Game Player tabs and try again.",
        ),
      );
    }, 5000);

    request.onsuccess = () => {
      globalThis.clearTimeout(timeoutId);
      resolve();
    };
    request.onerror = () => {
      globalThis.clearTimeout(timeoutId);
      reject(request.error ?? new Error("Could not clear browser storage."));
    };
    request.onblocked = () => {
      // Give open service workers and tabs a chance to close their database handles.
    };
  });
}

export async function putLocalFolderHandle(gameId: string, handle: BrowserFileSystemDirectoryHandle): Promise<void> {
  const db = await openPlayerDb();
  try {
    const transaction = db.transaction(HANDLE_STORE, "readwrite");
    transaction.objectStore(HANDLE_STORE).put({ gameId, handle } satisfies LocalFolderHandleRecord);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function getLocalFolderHandle(gameId: string): Promise<BrowserFileSystemDirectoryHandle | undefined> {
  const db = await openPlayerDb();
  try {
    const transaction = db.transaction(HANDLE_STORE, "readonly");
    const record = await requestToPromise<LocalFolderHandleRecord | undefined>(
      transaction.objectStore(HANDLE_STORE).get(gameId)
    );
    return record?.handle;
  } finally {
    db.close();
  }
}

export async function putStoredFiles(records: StoredGameFile[]): Promise<void> {
  if (records.length === 0) return;

  const db = await openPlayerDb();
  try {
    const transaction = db.transaction(FILE_STORE, "readwrite");
    const store = transaction.objectStore(FILE_STORE);
    for (const record of records) {
      store.put({ ...record, key: fileKey(record.gameId, record.path) });
    }
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function getStoredFilesForGame(gameId: string): Promise<StoredGameFile[]> {
  const db = await openPlayerDb();
  try {
    const transaction = db.transaction(FILE_STORE, "readonly");
    return await requestToPromise<StoredGameFile[]>(
      transaction.objectStore(FILE_STORE).index("gameId").getAll(IDBKeyRange.only(gameId)),
    );
  } finally {
    db.close();
  }
}

export async function getIndexedDbBlobs(storageRefs: string[]): Promise<Map<string, Blob>> {
  if (storageRefs.length === 0) return new Map();

  const db = await openPlayerDb();
  try {
    const transaction = db.transaction(BLOB_STORE, "readonly");
    const store = transaction.objectStore(BLOB_STORE);
    const requests = storageRefs.map(async (storageRef) => {
      const record = await requestToPromise<StoredBlobRecord | undefined>(store.get(storageRef));
      return [storageRef, record?.blob] as const;
    });
    const records = await Promise.all(requests);
    return new Map(
      records.filter((record): record is readonly [string, Blob] => Boolean(record[1])),
    );
  } finally {
    db.close();
  }
}

export async function replaceStoredFilesForGame(
  gameId: string,
  records: StoredGameFile[],
): Promise<void> {
  const db = await openPlayerDb();
  try {
    const transaction = db.transaction([FILE_STORE, BLOB_STORE], "readwrite");
    const fileStore = transaction.objectStore(FILE_STORE);
    const blobStore = transaction.objectStore(BLOB_STORE);
    const fileIndex = fileStore.index("gameId");
    const fileRequest = fileIndex.openCursor(IDBKeyRange.only(gameId));

    fileRequest.onsuccess = () => {
      const cursor = fileRequest.result;
      if (!cursor) {
        for (const record of records) {
          fileStore.put({ ...record, key: fileKey(record.gameId, record.path) });
        }
        return;
      }

      const record = cursor.value as StoredGameFile & { key: string };
      blobStore.delete(record.key);
      cursor.delete();
      cursor.continue();
    };

    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function putIndexedDbBlobs(records: Array<{ gameId: string; path: string; blob: Blob }>): Promise<StoredGameFile[]> {
  if (records.length === 0) return [];

  const storedFiles = records.map(({ gameId, path, blob }) => {
    const normalizedPath = normalizeStoredPath(path);
    const key = fileKey(gameId, normalizedPath);
    const fileRecord: StoredGameFile & { key: string } = {
      key,
      gameId,
      path: normalizedPath,
      size: blob.size,
      mime: detectMime(normalizedPath),
      storageRef: key,
      storageKind: "indexeddb"
    };

    return {
      blobRecord: { key, blob } satisfies StoredBlobRecord,
      fileRecord
    };
  });

  const db = await openPlayerDb();
  try {
    const transaction = db.transaction([BLOB_STORE, FILE_STORE], "readwrite");
    const blobStore = transaction.objectStore(BLOB_STORE);
    const fileStore = transaction.objectStore(FILE_STORE);
    for (const { blobRecord, fileRecord } of storedFiles) {
      blobStore.put(blobRecord);
      fileStore.put(fileRecord);
    }
    await transactionDone(transaction);
  } finally {
    db.close();
  }

  return storedFiles.map(({ fileRecord }) => {
    const { key: _key, ...record } = fileRecord;
    return record;
  });
}

export async function getIndexedDbBlob(storageRef: string): Promise<Blob | undefined> {
  const db = await openPlayerDb();
  try {
    const transaction = db.transaction(BLOB_STORE, "readonly");
    const record = await requestToPromise<StoredBlobRecord | undefined>(transaction.objectStore(BLOB_STORE).get(storageRef));
    return record?.blob;
  } finally {
    db.close();
  }
}

function getOpfsRoot(): Promise<BrowserFileSystemDirectoryHandle> | undefined {
  const storage = navigator.storage as StorageManager & {
    getDirectory?: () => Promise<BrowserFileSystemDirectoryHandle>;
  };
  return storage.getDirectory?.();
}

export function supportsOpfs(): boolean {
  return typeof navigator !== "undefined" && Boolean(getOpfsRoot());
}

async function getOpfsGameDir(gameId: string, create: boolean): Promise<BrowserFileSystemDirectoryHandle> {
  const root = await getOpfsRoot();
  if (!root) throw new Error("OPFS is not supported in this browser.");
  const gamesDir = await root.getDirectoryHandle("games", { create });
  return gamesDir.getDirectoryHandle(gameId, { create });
}

export async function createOpfsWriter(gameId: string): Promise<{
  putFile(path: string, blob: Blob): Promise<StoredGameFile>;
}> {
  const gameDir = await getOpfsGameDir(gameId, true);
  const dirCache = new Map<string, BrowserFileSystemDirectoryHandle>([["", gameDir]]);

  async function getCachedDir(parts: string[]): Promise<BrowserFileSystemDirectoryHandle> {
    const cacheKey = parts.join("/");
    const cached = dirCache.get(cacheKey);
    if (cached) return cached;

    const parent = await getCachedDir(parts.slice(0, -1));
    const dir = await parent.getDirectoryHandle(parts[parts.length - 1], { create: true });
    dirCache.set(cacheKey, dir);
    return dir;
  }

  return {
    async putFile(path: string, blob: Blob): Promise<StoredGameFile> {
      const normalizedPath = normalizeStoredPath(path);
      const parts = normalizedPath.split("/");
      const name = parts.pop();
      if (!name) throw new Error("Invalid file path.");

      const dir = await getCachedDir(parts);
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();

      return {
        gameId,
        path: normalizedPath,
        size: blob.size,
        mime: detectMime(normalizedPath),
        storageRef: `games/${gameId}/${normalizedPath}`,
        storageKind: "opfs"
      };
    }
  };
}

export async function getOpfsBlob(gameId: string, path: string): Promise<Blob | undefined> {
  try {
    const parts = normalizeStoredPath(path).split("/");
    const name = parts.pop();
    if (!name) return undefined;

    let dir = await getOpfsGameDir(gameId, false);
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part);
    }
    const handle = await dir.getFileHandle(name);
    return await handle.getFile();
  } catch {
    return undefined;
  }
}

async function removeOpfsGame(gameId: string): Promise<void> {
  try {
    const root = await getOpfsRoot();
    if (!root) return;
    const gamesDir = await root.getDirectoryHandle("games");
    await gamesDir.removeEntry(gameId, { recursive: true });
  } catch {
    // OPFS cleanup is best-effort because older browsers can store only in IndexedDB.
  }
}

async function removeOpfsGames(): Promise<void> {
  try {
    const root = await getOpfsRoot();
    if (!root) return;
    await root.removeEntry("games", { recursive: true });
  } catch {
    // OPFS cleanup is best-effort because older browsers can store only in IndexedDB.
  }
}

export async function estimateStorage(): Promise<StorageEstimate | undefined> {
  return navigator.storage?.estimate?.();
}
