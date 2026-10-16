import { normalizeStoredPath } from "@/src/lib/paths";
import { getStoredFilesForGame } from "@/src/lib/storage";
import type {
  IndexedDbRecord,
  IndexedDbWrite,
} from "@/src/lib/saveTypes";

const WOLF_FILE_MODE = 0o100666;
const WOLF_DIRECTORY_MODE = 0o40777;

export function wolfSaveRelativePath(path: string): string | undefined {
  let normalized = normalizeStoredPath(path);
  const saveRoot = normalized.toLowerCase().indexOf("-save/");
  if (saveRoot >= 0) {
    normalized = normalized.slice(saveRoot + "-Save/".length);
  }
  if (!normalized.toLowerCase().startsWith("save/")) return undefined;
  return normalized;
}

export async function deriveWolfDatabaseName(gameId: string): Promise<string> {
  const files = await getStoredFilesForGame(gameId);
  const settingsPath = files
    .map((file) => normalizeStoredPath(file.path))
    .filter((path) => path.toLowerCase().endsWith("settings.js"))
    .sort((a, b) => a.length - b.length)[0];
  if (!settingsPath) {
    throw new Error("Could not locate the WOLF project settings for this game.");
  }
  const response = await fetch(gameFileUrl(gameId, settingsPath));
  if (!response.ok) {
    throw new Error("Could not read the WOLF project settings for this game.");
  }
  const source = await response.text();
  const match = /\bprojectId\s*:\s*(["'])(.*?)\1/u.exec(source);
  if (!match?.[2]) {
    throw new Error("Could not identify the WOLF project save directory.");
  }
  return `/data0/${gameId}_${match[2].replace("/", "")}-Save`;
}

export function wolfIndexedDbWritesForImport(
  database: string,
  relativePath: string,
  contents: Uint8Array,
): IndexedDbWrite[] {
  const timestamp = new Date();
  const root = database.replace(/\/+$/u, "");
  const relativeParts = relativePath.split("/");
  relativeParts.pop();
  const writes: IndexedDbWrite[] = [];
  let directory = root;
  for (const part of relativeParts) {
    directory += `/${part}`;
    writes.push({
      database,
      store: "FILE_DATA",
      key: directory,
      value: { timestamp, mode: WOLF_DIRECTORY_MODE },
      timestampIndex: true,
    });
  }
  writes.push({
    database,
    store: "FILE_DATA",
    key: `${root}/${relativePath}`,
    value: { timestamp, mode: WOLF_FILE_MODE, contents },
    timestampIndex: true,
  });
  return writes;
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

function gameFileUrl(gameId: string, path: string): string {
  const encodedPath = normalizeStoredPath(path)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `/play/${encodeURIComponent(gameId)}/${encodedPath}`;
}
