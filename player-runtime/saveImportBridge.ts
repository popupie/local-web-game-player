import type {
  RuntimeSaveImportEngine,
  RuntimeSaveImportEntry,
  RuntimeSaveImportRequest,
  RuntimeSaveImportResponse,
} from "@/shared/saveImportRuntime";

export interface PreparedRuntimeSaveImport<T> {
  collisionCount: number;
  importedEntries: number;
  value: T;
}

export interface RuntimeSaveImportAdapter<T> {
  engine: RuntimeSaveImportEngine;
  expiredSessionMessage: string;
  ready?: () => Promise<void>;
  prepare: (
    entries: RuntimeSaveImportEntry[],
  ) => Promise<PreparedRuntimeSaveImport<T>>;
  commit: (value: T) => Promise<void>;
}

interface PreparedSession<T> {
  importedEntries: number;
  value: T;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function installRuntimeSaveImportBridge<T>(
  gameId: string,
  adapter: RuntimeSaveImportAdapter<T>,
): void {
  const prepared = new Map<string, PreparedSession<T>>();
  const readiness = new Map<string, Promise<void>>();
  const activeRequests = new Set<string>();

  const postParent = (message: RuntimeSaveImportResponse): void => {
    window.parent.postMessage(message, window.location.origin);
  };

  const fail = (requestId: string, cause: unknown): void => {
    if (!activeRequests.delete(requestId)) return;
    readiness.delete(requestId);
    prepared.delete(requestId);
    postParent({
      type: "save-import-error",
      requestId,
      gameId,
      engine: adapter.engine,
      message: errorMessage(cause),
    });
  };

  window.addEventListener(
    "message",
    (event: MessageEvent<RuntimeSaveImportRequest>) => {
      const message = event.data;
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent ||
        !message ||
        message.gameId !== gameId ||
        message.engine !== adapter.engine
      ) {
        return;
      }

      if (message.type === "save-import-abort") {
        activeRequests.delete(message.requestId);
        readiness.delete(message.requestId);
        prepared.delete(message.requestId);
        return;
      }

      if (message.type === "save-import-probe") {
        if (readiness.has(message.requestId)) return;
        activeRequests.add(message.requestId);
        const ready = adapter.ready?.() ?? Promise.resolve();
        readiness.set(message.requestId, ready);
        void ready.then(
          () => {
            if (readiness.get(message.requestId) !== ready) return;
            postParent({
              type: "save-import-ready",
              requestId: message.requestId,
              gameId,
              engine: adapter.engine,
            });
          },
          (cause) => fail(message.requestId, cause),
        );
        return;
      }

      void (async () => {
        try {
          if (message.type === "save-import-prepare") {
            const result = await adapter.prepare(message.entries);
            if (!activeRequests.has(message.requestId)) return;
            readiness.delete(message.requestId);
            prepared.set(message.requestId, {
              importedEntries: result.importedEntries,
              value: result.value,
            });
            postParent({
              type: "save-import-prepared",
              requestId: message.requestId,
              gameId,
              engine: adapter.engine,
              collisionCount: result.collisionCount,
              importedEntries: result.importedEntries,
            });
            return;
          }

          const session = prepared.get(message.requestId);
          if (!session) throw new Error(adapter.expiredSessionMessage);
          await adapter.commit(session.value);
          if (!activeRequests.delete(message.requestId)) return;
          prepared.delete(message.requestId);
          postParent({
            type: "save-import-complete",
            requestId: message.requestId,
            gameId,
            engine: adapter.engine,
            importedEntries: session.importedEntries,
          });
        } catch (cause) {
          fail(message.requestId, cause);
        }
      })();
    },
  );
}
