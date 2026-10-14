export const INDEXED_DB_MARKER_PREFIX = "__mz_player_indexeddb:";

export function trackedIndexedDbMarkerPrefix(namespace: string): string {
  return `${INDEXED_DB_MARKER_PREFIX}${encodeURIComponent(namespace)}:`;
}

export function trackedIndexedDbMarkerKey(
  namespace: string,
  databaseName: string,
): string {
  return `${trackedIndexedDbMarkerPrefix(namespace)}${encodeURIComponent(databaseName)}`;
}

export function trackIndexedDbDatabases(namespace: string): void {
  const factory = window.indexedDB;
  if (!factory) return;

  const trackedFactory = factory as IDBFactory & {
    __mzPlayerDatabaseTrackingNamespace?: string;
  };
  if (trackedFactory.__mzPlayerDatabaseTrackingNamespace === namespace) return;

  const rawSetItem = Storage.prototype.setItem;
  const rawRemoveItem = Storage.prototype.removeItem;
  const originalOpen = factory.open.bind(factory);
  const originalDeleteDatabase = factory.deleteDatabase.bind(factory);
  const markerKey = (name: string) => trackedIndexedDbMarkerKey(namespace, name);
  const markDatabase = (name: string) => {
    try {
      rawSetItem.call(window.localStorage, markerKey(name), "1");
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
          markDatabase(databaseName);
          return version === undefined
            ? originalOpen(databaseName)
            : originalOpen(databaseName, version);
        },
      },
      deleteDatabase: {
        configurable: true,
        value(name: string) {
          const databaseName = String(name);
          const request = originalDeleteDatabase(databaseName);
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
