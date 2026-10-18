import { normalizeStoredPath } from "@/src/lib/paths";
import type { IndexedDbRecord } from "@/src/lib/saveTypes";

export const RPG_MAKER_SAVE_DATABASE = "localforage";

export function rpgMakerExportPathForStorageKey(
  key: string,
): string | undefined {
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

export function rpgMakerLocalStorageKeyForImport(
  path: string,
): string | undefined {
  const normalized = normalizeStoredPath(path).toLowerCase();
  const match = /^(?:www\/)?save\/(.+)$/u.exec(normalized);
  if (!match) return undefined;
  const filename = match[1].split("/").at(-1) ?? match[1];
  if (filename === "config.rpgsave") return "RPG Config";
  if (filename === "global.rpgsave") return "RPG Global";
  const slot = /^file(\d+)\.rpgsave(bak|\.bak)?$/u.exec(filename);
  if (slot) return `RPG File${slot[1]}${slot[2] ? "bak" : ""}`;
  return filename.endsWith(".rpgsave") ? `RPG Save ${match[1]}` : undefined;
}

export function rpgMakerIndexedDbKeyForImport(
  path: string,
): string | undefined {
  const filename = normalizeStoredPath(path).split("/").at(-1)?.toLowerCase();
  if (!filename?.endsWith(".rmmzsave")) return undefined;
  return `rmmzsave.${filename.slice(0, -".rmmzsave".length)}`;
}

export function isRpgMakerIndexedDbSaveRecord(
  record: IndexedDbRecord,
): boolean {
  return (
    isRpgMakerIndexedDbRecord(record) &&
    record.store === "keyvaluepairs" &&
    typeof record.key === "string" &&
    Boolean(rpgMakerExportPathForStorageKey(record.key))
  );
}

export function isRpgMakerIndexedDbRecord(record: IndexedDbRecord): boolean {
  return isRpgMakerSaveDatabase(record.database);
}

export function isRpgMakerSaveDatabase(database: string): boolean {
  return database === RPG_MAKER_SAVE_DATABASE;
}
