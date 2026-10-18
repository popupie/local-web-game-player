import {
  INDEXED_DB_MARKER_PREFIX,
  INDEXED_DB_SCOPE_PREFIX,
  trackedIndexedDbPhysicalName,
  trackedIndexedDbMarkerPrefix,
} from "@/shared/indexedDbSaveTracking";
import { indexedDbNamesForGame } from "@/src/lib/saveExport";
import { detectGameEngine } from "@/src/engines/detect";
import {
  CONSTRUCT2_METADATA_DATABASE,
  CONSTRUCT2_SAVE_DATABASE,
  isConstructSaveDatabase,
} from "@/src/engines/construct2/save";
import {
  RPG_MAKER_SAVE_DATABASE,
  isRpgMakerSaveDatabase,
} from "@/src/engines/rpgmaker_mvmz/save";
import { isWolfSaveDatabase } from "@/src/engines/wolf/save";
import type { GameEngine } from "@/src/engines/types";
import { storageNamespace } from "@/src/lib/keys";
import type { GameRecord } from "@/src/lib/types";

const PLAYER_DATABASE_NAME = "mvmz-browser-player";

type DatabaseInfoFactory = IDBFactory & {
  databases?: () => Promise<Array<{ name?: string }>>;
};

function openExistingDatabase(
  factory: IDBFactory,
  name: string,
): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    let created = false;
    const request = factory.open(name);
    request.onupgradeneeded = () => {
      created = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      if (created) {
        request.result.close();
        resolve(undefined);
        return;
      }
      resolve(request.result);
    };
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  });
}

async function deleteDatabase(
  factory: IDBFactory,
  name: string,
): Promise<void> {
  if (!name || name === PLAYER_DATABASE_NAME) return;
  await new Promise<void>((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error(`Could not remove ${name}.`));
    request.onblocked = () =>
      reject(new Error("Close other player tabs before clearing save data."));
  });
}

async function deleteStoreRecords(
  factory: IDBFactory,
  databaseName: string,
  storeName: string,
  shouldDelete: (key: IDBValidKey) => boolean,
): Promise<void> {
  const database = await openExistingDatabase(factory, databaseName);
  if (!database) return;
  try {
    if (!database.objectStoreNames.contains(storeName)) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const request = transaction.objectStore(storeName).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (shouldDelete(cursor.key)) cursor.delete();
        cursor.continue();
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Could not scan save records."));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ?? new Error("Could not remove save records."),
        );
      transaction.onabort = transaction.onerror;
    });
  } finally {
    database.close();
  }
}

function databaseUsedByAnotherGame(
  gameId: string,
  physicalName: string,
  storage: Storage,
): boolean {
  const ownPrefix = trackedIndexedDbMarkerPrefix(storageNamespace(gameId));
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(INDEXED_DB_MARKER_PREFIX)) continue;
    if (key.startsWith(ownPrefix)) continue;
    const marker = storage.getItem(key);
    if (marker === physicalName) return true;
    if (marker !== "1") continue;
    const separator = key.lastIndexOf(":");
    if (separator < INDEXED_DB_MARKER_PREFIX.length) continue;
    try {
      if (decodeURIComponent(key.slice(separator + 1)) === physicalName) {
        return true;
      }
    } catch {
      // Ignore malformed marker keys.
    }
  }
  return false;
}

function removeTrackedDatabaseMarkers(
  storage: Storage,
  prefix: string = INDEXED_DB_MARKER_PREFIX,
): void {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

async function clearKnownEngineDatabase(
  gameId: string,
  engine: GameEngine,
  databaseName: string,
  storage: Storage,
  factory: IDBFactory,
): Promise<void> {
  const physicalName = trackedIndexedDbPhysicalName(
    storageNamespace(gameId),
    databaseName,
    storage,
  );
  const sharedWithAnotherGame = databaseUsedByAnotherGame(
    gameId,
    physicalName,
    storage,
  );

  if (physicalName !== databaseName) {
    if (!sharedWithAnotherGame) await deleteDatabase(factory, physicalName);
    return;
  }
  if (sharedWithAnotherGame) return;

  if (engine === "rpg-maker" && isRpgMakerSaveDatabase(databaseName)) {
    await deleteStoreRecords(
      factory,
      physicalName,
      "keyvaluepairs",
      (key) => typeof key === "string" && key.startsWith("rmmzsave."),
    );
    return;
  }
  if (engine === "construct-2" && isConstructSaveDatabase(databaseName)) {
    await deleteStoreRecords(factory, physicalName, "saves", () => true);
    return;
  }
  if (
    engine === "wolf" &&
    isWolfSaveDatabase(databaseName) &&
    databaseName.includes(gameId)
  ) {
    await deleteDatabase(factory, physicalName);
    return;
  }
  await deleteDatabase(factory, physicalName);
}

export async function clearGameIndexedDbSaves(
  game: GameRecord,
  storage: Storage = window.localStorage,
  factory: IDBFactory = window.indexedDB,
): Promise<void> {
  let engine: GameEngine = "unknown";
  try {
    engine = await detectGameEngine(game.id);
  } catch {}
  const names = await indexedDbNamesForGame(game.id, engine, storage, factory);
  if (engine === "construct-2") names.push(CONSTRUCT2_METADATA_DATABASE);
  for (const name of names) {
    await clearKnownEngineDatabase(game.id, engine, name, storage, factory);
  }
  removeTrackedDatabaseMarkers(
    storage,
    trackedIndexedDbMarkerPrefix(storageNamespace(game.id)),
  );
}

function trackedDatabaseNames(storage: Storage): Set<string> {
  const names = new Set<string>();
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(INDEXED_DB_MARKER_PREFIX)) continue;
    const separator = key.lastIndexOf(":");
    if (separator < INDEXED_DB_MARKER_PREFIX.length) continue;
    try {
      const logicalName = decodeURIComponent(key.slice(separator + 1));
      const marker = storage.getItem(key);
      names.add(marker && marker !== "1" ? marker : logicalName);
    } catch {
      // Ignore malformed markers and continue cleaning the known databases.
    }
  }
  return names;
}

export async function clearAllGameIndexedDbSaves(
  storage: Storage = window.localStorage,
  factory: IDBFactory = window.indexedDB,
): Promise<void> {
  const names = trackedDatabaseNames(storage);
  names.add(RPG_MAKER_SAVE_DATABASE);
  names.add(CONSTRUCT2_SAVE_DATABASE);

  const enumerate = (factory as DatabaseInfoFactory).databases;
  if (typeof enumerate === "function") {
    try {
      for (const database of await enumerate.call(factory)) {
        if (
          database.name?.startsWith(INDEXED_DB_SCOPE_PREFIX) ||
          (database.name && isWolfSaveDatabase(database.name)) ||
          (database.name && isRpgMakerSaveDatabase(database.name)) ||
          (database.name && isConstructSaveDatabase(database.name))
        ) {
          names.add(database.name);
        }
      }
    } catch {
      // Marker-based cleanup remains available when enumeration is blocked.
    }
  }

  for (const name of names) {
    await deleteDatabase(factory, name);
  }
  removeTrackedDatabaseMarkers(storage);
}
