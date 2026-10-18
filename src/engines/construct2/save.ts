import type { IndexedDbRecord } from "@/src/lib/saveTypes";
import {
  createSaveImportFrame,
  importSavesThroughRuntime,
  type RuntimeSaveEntry,
  type RuntimeSaveImportResult,
} from "@/src/lib/runtimeSaveImport";
import type { GameRecord } from "@/src/lib/types";

export const CONSTRUCT2_SAVE_DATABASE = "_C2SaveStates";
export const CONSTRUCT2_METADATA_DATABASE = "localforage";

export function constructExportPathForStorageKey(
  key: string,
): string | undefined {
  const match = /^__c2save_(.+)$/u.exec(key);
  return match ? `save/${safeSaveSlot(match[1])}.json` : undefined;
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

export async function importConstruct2Saves(
  game: GameRecord,
  entries: RuntimeSaveEntry[],
  options: {
    confirmOverwrite?: (collisionCount: number) => boolean | Promise<boolean>;
    frame?: HTMLIFrameElement;
  } = {},
): Promise<RuntimeSaveImportResult> {
  const ownsFrame = !options.frame;
  const frame = options.frame ?? createSaveImportFrame(game);
  if (ownsFrame) document.body.append(frame);
  try {
    return await importSavesThroughRuntime(game, "construct-2", entries, {
      confirmOverwrite: options.confirmOverwrite,
      frame,
    });
  } finally {
    if (ownsFrame) frame.remove();
  }
}
