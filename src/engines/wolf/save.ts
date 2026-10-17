import { normalizeStoredPath } from "@/src/lib/paths";
import type { IndexedDbRecord } from "@/src/lib/saveTypes";

export function wolfSaveRelativePath(path: string): string | undefined {
  let normalized = normalizeStoredPath(path);
  const saveRoot = normalized.toLowerCase().indexOf("-save/");
  if (saveRoot >= 0) {
    normalized = normalized.slice(saveRoot + "-Save/".length);
  }
  if (!normalized.toLowerCase().startsWith("save/")) return undefined;
  return normalized;
}

export function isWolfIndexedDbSaveRecord(record: IndexedDbRecord): boolean {
  return (
    isWolfIndexedDbRecord(record) &&
    record.store === "FILE_DATA" &&
    typeof record.key === "string" &&
    Boolean(wolfSaveRelativePath(record.key))
  );
}

export function isWolfIndexedDbRecord(record: IndexedDbRecord): boolean {
  return isWolfSaveDatabase(record.database);
}

export function isWolfSaveDatabase(database: string): boolean {
  return database.endsWith("-Save");
}
