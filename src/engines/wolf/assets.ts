import { getSessionFolderFile } from "@/src/lib/sessionFiles";
import {
  getIndexedDbBlobs,
  getLocalFolderHandle,
  getOpfsBlob,
  getStoredFilesForGame,
  type BrowserFileSystemDirectoryHandle,
} from "@/src/lib/storage";
import { normalizeStoredPath } from "@/src/lib/paths";
import type { GameRecord, StoredGameFile } from "@/src/lib/types";
import type { WolfAsset } from "@/src/engines/wolf/messages";

export type WolfAssetObjectUrlSet = {
  assets: WolfAsset[];
  release(): void;
};

const FILE_READ_CONCURRENCY = 32;
const COMBINED_DATA_ERROR = "Open the full combined WOLF game folder or ZIP containing both web/ and Data/.";

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

export async function createWolfAssetObjectUrls(
  { id: gameId, entryPath }: Pick<GameRecord, "id" | "entryPath">,
): Promise<WolfAssetObjectUrlSet> {
  const records = await getStoredFilesForGame(gameId);
  const normalizedEntry = normalizeStoredPath(entryPath);
  const exportRoot = normalizedEntry.slice(0, normalizedEntry.lastIndexOf("/") + 1);
  const localFolderHandle = records.some((record) => record.storageKind === "local-folder")
    ? await getLocalFolderHandle(gameId)
    : undefined;
  const readLocalFolder = localFolderHandle ? localFolderReader(localFolderHandle) : undefined;

  async function readBlob(
    record: StoredGameFile,
    indexedBlobs?: Map<string, Blob>,
  ): Promise<Blob | undefined> {
    if (record.storageKind === "indexeddb") {
      const blobs = indexedBlobs ?? await getIndexedDbBlobs([record.storageRef]);
      return blobs.get(record.storageRef);
    }
    if (record.storageKind === "opfs") return getOpfsBlob(gameId, record.path);
    if (record.storageKind === "local-folder") {
      return readLocalFolder?.(record.storageRef || record.path);
    }
    if (record.storageKind === "session-file") {
      return getSessionFolderFile(gameId, record.storageRef || record.path);
    }
    return undefined;
  }

  async function readExportJson<T>(name: string): Promise<T | undefined> {
    const path = (exportRoot + name).toLowerCase();
    const record = records.find((file) => normalizeStoredPath(file.path).toLowerCase() === path);
    const blob = record && await readBlob(record);
    if (!blob) return undefined;
    const text = await blob.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined;
    }
  }

  const metadata = await readExportJson<{
    layout?: string;
    data?: { shared?: boolean; assetBase?: string };
  }>("browser-game.json");
  const shared = metadata?.layout === "combined" ||
    metadata?.data?.shared === true || metadata?.data?.assetBase === "../";
  if (shared && !exportRoot) throw new Error(COMBINED_DATA_ERROR);

  // A combined export's assets live one level above its entry page.
  const assetRoot = shared ? exportRoot.replace(/[^/]+\/$/u, "") : exportRoot;
  const lowerAssetRoot = assetRoot.toLowerCase();
  const manifest = shared ? await readExportJson<{ preload?: unknown }>("asset_manifest.json") : undefined;
  const preloadPaths = new Set<string>();
  if (Array.isArray(manifest?.preload)) {
    for (const path of manifest.preload) {
      if (typeof path === "string" && !/[/\\]/u.test(path)) {
        preloadPaths.add(path.toLowerCase());
      }
    }
  }

  const looseFiles = records.flatMap((record) => {
    const storedPath = normalizeStoredPath(record.path);
    if (!storedPath.toLowerCase().startsWith(lowerAssetRoot)) return [];
    const path = storedPath.slice(assetRoot.length);
    const lowerPath = path.toLowerCase();
    const isDataFile = lowerPath.startsWith("data/");
    const preload = preloadPaths.has(lowerPath);
    return isDataFile || preload ? [{ record, path, isDataFile, preload }] : [];
  });
  if (!looseFiles.some((file) => file.isDataFile)) {
    throw new Error(shared ? COMBINED_DATA_ERROR : "This WOLF export has no loose Data files.");
  }
  const indexedBlobs = await getIndexedDbBlobs(looseFiles
    .filter(({ record }) => record.storageKind === "indexeddb")
    .map(({ record }) => record.storageRef));

  const objectUrls: string[] = [];
  try {
    const assets = await concurrentMap(looseFiles, async ({ record, path, preload }) => {
      const blob = await readBlob(record, indexedBlobs);
      if (!blob) throw new Error(`Could not read WOLF asset: ${record.path}`);
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      return { path, url, size: blob.size, ...(preload ? { preload } : {}) };
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
