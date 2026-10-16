import { normalizeStoredPath } from "@/src/lib/paths";
import type {
  IndexedDbRecord,
  IndexedDbWrite,
} from "@/src/lib/saveTypes";

export const CONSTRUCT2_SAVE_DATABASE = "_C2SaveStates";

export function constructExportPathForStorageKey(
  key: string,
): string | undefined {
  const match = /^__c2save_(.+)$/u.exec(key);
  return match ? `save/${safeSaveSlot(match[1])}.json` : undefined;
}

export function constructSlotForImportPath(path: string): string | undefined {
  const match = /^save\/(.+)\.json$/iu.exec(normalizeStoredPath(path));
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new Error(`Invalid encoded Construct 2 save slot: ${match[1]}`);
  }
}

export function constructIndexedDbWriteForImport(
  slot: string,
  data: string,
): IndexedDbWrite {
  return {
    database: CONSTRUCT2_SAVE_DATABASE,
    store: "saves",
    key: slot,
    value: { slot, data },
    keyPath: "slot",
  };
}

export function isConstructIndexedDbSaveRecord(
  record: IndexedDbRecord,
): boolean {
  return isConstructIndexedDbRecord(record) && record.store === "saves";
}

export function isConstructIndexedDbRecord(record: IndexedDbRecord): boolean {
  return isConstructSaveDatabase(record.database);
}

export function isConstructSaveDatabase(database: string): boolean {
  return database === CONSTRUCT2_SAVE_DATABASE;
}

function safeSaveSlot(value: string): string {
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
