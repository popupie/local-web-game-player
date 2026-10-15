export const INDEXED_DB_MARKER_PREFIX = "__mz_player_indexeddb:";
export const INDEXED_DB_SCOPE_PREFIX = "__mz_player_game_db:";

export function trackedIndexedDbMarkerPrefix(namespace: string): string {
  return `${INDEXED_DB_MARKER_PREFIX}${encodeURIComponent(namespace)}:`;
}

export function trackedIndexedDbMarkerKey(
  namespace: string,
  databaseName: string,
): string {
  return `${trackedIndexedDbMarkerPrefix(namespace)}${encodeURIComponent(databaseName)}`;
}

export function scopedIndexedDbName(
  namespace: string,
  databaseName: string,
): string {
  return `${INDEXED_DB_SCOPE_PREFIX}${encodeURIComponent(namespace)}:${encodeURIComponent(databaseName)}`;
}

export function trackedIndexedDbPhysicalName(
  namespace: string,
  databaseName: string,
  storage: Pick<Storage, "getItem">,
): string {
  const marker = storage.getItem(
    trackedIndexedDbMarkerKey(namespace, databaseName),
  );
  if (marker === "1") return databaseName;
  return marker || scopedIndexedDbName(namespace, databaseName);
}

export function trackIndexedDbDatabases(namespace: string): void {
  const factory = window.indexedDB;
  if (!factory) return;

  const trackedFactory = factory as IDBFactory & {
    __mzPlayerDatabaseTrackingNamespace?: string;
  };
  if (trackedFactory.__mzPlayerDatabaseTrackingNamespace === namespace) return;

  const rawGetItem = Storage.prototype.getItem;
  const rawSetItem = Storage.prototype.setItem;
  const rawRemoveItem = Storage.prototype.removeItem;
  const originalOpen = factory.open.bind(factory);
  const originalDeleteDatabase = factory.deleteDatabase.bind(factory);
  const markerKey = (name: string) => trackedIndexedDbMarkerKey(namespace, name);
  const physicalName = (name: string) => {
    try {
      const marker = rawGetItem.call(window.localStorage, markerKey(name));
      if (marker === "1") return name;
      return marker || scopedIndexedDbName(namespace, name);
    } catch {
      return scopedIndexedDbName(namespace, name);
    }
  };
  const markDatabase = (name: string, physical: string) => {
    try {
      rawSetItem.call(window.localStorage, markerKey(name), physical);
    } catch {
      // Storage discovery must never stop a game from opening its database.
    }
  };
  const unmarkDatabase = (name: string) => {
    try {
      rawRemoveItem.call(window.localStorage, markerKey(name));
    } catch {
      // The stale marker is harmless and can be ignored by the exporter.
    }
  };

  try {
    Object.defineProperties(factory, {
      __mzPlayerDatabaseTrackingNamespace: {
        configurable: true,
        value: namespace,
      },
      open: {
        configurable: true,
        value(name: string, version?: number) {
          const databaseName = String(name);
          const physicalDatabaseName = physicalName(databaseName);
          markDatabase(databaseName, physicalDatabaseName);
          return version === undefined
            ? originalOpen(physicalDatabaseName)
            : originalOpen(physicalDatabaseName, version);
        },
      },
      deleteDatabase: {
        configurable: true,
        value(name: string) {
          const databaseName = String(name);
          const request = originalDeleteDatabase(physicalName(databaseName));
          request.addEventListener("success", () => {
            unmarkDatabase(databaseName);
          });
          return request;
        },
      },
    });
  } catch {
    // Database enumeration remains available in browsers that lock IDBFactory.
  }
}
