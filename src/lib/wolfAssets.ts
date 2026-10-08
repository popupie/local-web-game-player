import { getSessionFolderFile } from "./sessionFiles";
import {
  getIndexedDbBlobs,
  getLocalFolderHandle,
  getOpfsBlob,
  getStoredFilesForGame,
  type BrowserFileSystemDirectoryHandle,
} from "./storage";
import { normalizeStoredPath } from "./paths";
import type { StoredGameFile } from "./types";

export type WolfAssetObjectUrl = {
  path: string;
  url: string;
  size: number;
};

export type WolfAssetObjectUrlSet = {
  assets: WolfAssetObjectUrl[];
  release(): void;
};

const FILE_READ_CONCURRENCY = 32;

function isLooseWolfAsset(path: string): boolean {
  return normalizeStoredPath(path).toLowerCase().startsWith("data/");
}

async function concurrentMap<T, R>(
  values: T[],
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function consume() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(FILE_READ_CONCURRENCY, values.length) },
    consume,
  );
  await Promise.all(workers);
  return results;
}

function localFolderReader(root: BrowserFileSystemDirectoryHandle) {
  const directories = new Map<string, Promise<BrowserFileSystemDirectoryHandle>>([
    ["", Promise.resolve(root)],
  ]);

  function directory(parts: string[]): Promise<BrowserFileSystemDirectoryHandle> {
    const key = parts.join("/");
    const cached = directories.get(key);
    if (cached) return cached;
    const pending = directory(parts.slice(0, -1)).then((parent) =>
      parent.getDirectoryHandle(parts.at(-1) || ""),
    );
    directories.set(key, pending);
    return pending;
  }

  return async (path: string): Promise<Blob | undefined> => {
    try {
      const parts = normalizeStoredPath(path).split("/");
      const name = parts.pop();
      if (!name) return undefined;
      const parent = await directory(parts);
      return await (await parent.getFileHandle(name)).getFile();
    } catch {
      return undefined;
    }
  };
}

export async function createWolfAssetObjectUrls(gameId: string): Promise<WolfAssetObjectUrlSet> {
  const records = (await getStoredFilesForGame(gameId)).filter((record) =>
    isLooseWolfAsset(record.path),
  );
  if (records.length === 0) {
    throw new Error("This WOLF export has no loose Data files.");
  }

  const indexedRecords = records.filter((record) => record.storageKind === "indexeddb");
  const indexedBlobs = await getIndexedDbBlobs(
    indexedRecords.map((record) => record.storageRef),
  );
  const localFolderHandle = records.some((record) => record.storageKind === "local-folder")
    ? await getLocalFolderHandle(gameId)
    : undefined;
  const readLocalFolder = localFolderHandle ? localFolderReader(localFolderHandle) : undefined;

  async function readBlob(record: StoredGameFile): Promise<Blob | undefined> {
    if (record.storageKind === "indexeddb") return indexedBlobs.get(record.storageRef);
    if (record.storageKind === "opfs") return getOpfsBlob(gameId, record.path);
    if (record.storageKind === "local-folder") {
      return readLocalFolder?.(record.storageRef || record.path);
    }
    if (record.storageKind === "session-file") {
      return getSessionFolderFile(gameId, record.storageRef || record.path);
    }
    return undefined;
  }

  const objectUrls: string[] = [];
  try {
    const assets = await concurrentMap(records, async (record) => {
      const blob = await readBlob(record);
      if (!blob) throw new Error(`Could not read WOLF asset: ${record.path}`);
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      return { path: normalizeStoredPath(record.path), url, size: blob.size };
    });
    return {
      assets,
      release() {
        for (const url of objectUrls) URL.revokeObjectURL(url);
        objectUrls.length = 0;
      },
    };
  } catch (error) {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    throw error;
  }
}
