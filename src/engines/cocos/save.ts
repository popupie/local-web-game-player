import { normalizeStoredPath } from "@/src/lib/paths";
import type { IndexedDbWrite } from "@/src/lib/saveTypes";

export function cocosIndexedDbKeysForImport(path: string): {
  directoryKeys: string[];
  fileKey: string;
} {
  const normalized = normalizeStoredPath(path);
  if (!normalized) throw new Error("A Cocos save file has an invalid path.");
  const fileKey = `dat:${normalized}`;
  const directoryKeys = ["dat:"];
  const parts = normalized.split("/");
  parts.pop();
  let directory = "dat:";
  for (const part of parts) {
    directory += directory.endsWith(":") ? part : `/${part}`;
    directoryKeys.push(directory);
  }
  return { directoryKeys, fileKey };
}

export function cocosIndexedDbWritesForImport(
  path: string,
  bytes: Uint8Array,
  knownDirectoryKeys: Set<string>,
): IndexedDbWrite[] {
  const timestamp = Date.now();
  const { directoryKeys, fileKey } = cocosIndexedDbKeysForImport(path);
  const writes: IndexedDbWrite[] = [];
  for (const directoryKey of directoryKeys) {
    if (knownDirectoryKeys.has(directoryKey)) continue;
    knownDirectoryKeys.add(directoryKey);
    writes.push({
      database: "zui-fs",
      store: "meta",
      key: directoryKey,
      value: {
        size: 0,
        mtime: timestamp,
        ctime: timestamp,
        isDir: true,
      },
    });
  }
  writes.push(
    {
      database: "zui-fs",
      store: "files",
      key: fileKey,
      value: bytes,
    },
    {
      database: "zui-fs",
      store: "meta",
      key: fileKey,
      value: {
        size: bytes.byteLength,
        mtime: timestamp,
        ctime: timestamp,
        isDir: false,
      },
    },
  );
  return writes;
}
