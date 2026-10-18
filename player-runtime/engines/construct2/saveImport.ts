import { restoreConstruct2SaveMetadata } from "@/player-runtime/engines/construct2/saveMetadata";
import { installRuntimeSaveImportBridge } from "@/player-runtime/saveImportBridge";
import type { RuntimeSaveImportEntry } from "@/shared/saveImportRuntime";

const DATABASE_NAME = "_C2SaveStates";
const STORE_NAME = "saves";

interface ConstructSave {
  slot: string;
  data: string;
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function slotForPath(path: string): string | undefined {
  const match = /^save\/(.+)\.json$/iu.exec(normalizePath(path));
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new Error(`Invalid encoded Construct 2 save slot: ${match[1]}`);
  }
}

function saveFromEntry(entry: RuntimeSaveImportEntry): ConstructSave {
  const slot = slotForPath(entry.path);
  if (!slot) throw new Error(`Invalid Construct 2 save path: ${entry.path}`);

  const data = new TextDecoder().decode(entry.data);
  try {
    const parsed = JSON.parse(data) as { c2save?: unknown };
    if (parsed?.c2save !== true) throw new Error();
  } catch {
    throw new Error(`Invalid Construct 2 save data: ${entry.path}`);
  }
  return { slot, data };
}

function savesFromEntries(entries: RuntimeSaveImportEntry[]): ConstructSave[] {
  const saves = new Map<string, ConstructSave>();
  for (const entry of entries) {
    const save = saveFromEntry(entry);
    saves.set(save.slot, save);
  }
  return Array.from(saves.values());
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Construct 2 save storage failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ?? new Error("Construct 2 save storage failed."),
      );
    transaction.onabort = transaction.onerror;
  });
}

function openSaveDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "slot" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () =>
      reject(
        request.error ?? new Error("Could not open Construct 2 save storage."),
      );
    request.onblocked = () =>
      reject(new Error("Close other player tabs before importing saves."));
  });
}

async function existingSaveCount(saves: ConstructSave[]): Promise<number> {
  const database = await openSaveDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const done = transactionDone(transaction);
    const existing = await Promise.all(
      saves.map(async ({ slot }) => {
        const indexedDbKey = await requestResult(store.getKey(slot));
        return (
          indexedDbKey !== undefined ||
          window.localStorage.getItem(`__c2save_${slot}`) !== null
        );
      }),
    );
    await done;
    return existing.filter(Boolean).length;
  } finally {
    database.close();
  }
}

async function storedSaveSlots(): Promise<string[]> {
  const database = await openSaveDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const records = await requestResult(
      transaction.objectStore(STORE_NAME).getAll(),
    );
    await done;
    return records
      .map((record) => record?.slot)
      .filter((slot): slot is string => typeof slot === "string");
  } finally {
    database.close();
  }
}

async function commitSaves(saves: ConstructSave[]): Promise<void> {
  const database = await openSaveDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    for (const save of saves) store.put(save);
    await transactionDone(transaction);
  } finally {
    database.close();
  }

  for (const save of saves) {
    window.localStorage.setItem(`__c2save_${save.slot}`, save.data);
  }
  await restoreConstruct2SaveMetadata(saves.map(({ slot }) => slot));
}

export function installConstruct2SaveImportBridge(gameId: string): void {
  installRuntimeSaveImportBridge<ConstructSave[]>(gameId, {
    engine: "construct-2",
    expiredSessionMessage: "The Construct 2 import session expired.",
    async prepare(entries) {
      const saves = savesFromEntries(entries);
      return {
        collisionCount: await existingSaveCount(saves),
        importedEntries: saves.length,
        value: saves,
      };
    },
    commit: commitSaves,
  });

  void storedSaveSlots()
    .then(restoreConstruct2SaveMetadata)
    .catch(() => {
      // Games that do not use C2 Local Storage need no metadata repair.
    });
}
