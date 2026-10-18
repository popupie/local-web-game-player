import type {
  RuntimeSaveImportEntry,
  RuntimeSaveImportRequest,
  RuntimeSaveImportResponse,
} from "@/shared/saveImportRuntime";

export interface WolfRuntimeModule {
  preRun: Array<(runtimeModule?: WolfRuntimeModule) => void>;
  canvas?: HTMLCanvasElement;
  projectId?: string;
  ready?: boolean;
  syncing?: boolean;
  woditor?: { initialized?: boolean };
}

interface WolfFileSystem {
  analyzePath(path: string): { exists: boolean };
  mkdir(path: string): void;
  syncfs(populate: boolean, callback: (error?: unknown) => void): unknown;
  writeFile(path: string, data: Uint8Array): unknown;
}

interface PreparedWolfSave {
  path: string;
  data: Uint8Array;
}

type InitializeGameWindow = typeof window & {
  initializeGame?: () => void;
};

function postParent(message: RuntimeSaveImportResponse): void {
  window.parent.postMessage(message, window.location.origin);
}

function normalizeSavePath(path: string): string {
  let normalized = path.replaceAll("\\", "/");
  const saveRoot = normalized.toLowerCase().indexOf("-save/");
  if (saveRoot >= 0) normalized = normalized.slice(saveRoot + "-save/".length);
  normalized = normalized.replace(/^\/+/u, "");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);

  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      throw new Error(`Invalid WOLF save path: ${path}`);
    }
    parts.push(part);
  }
  if (parts.length === 0) throw new Error(`Invalid WOLF save path: ${path}`);
  if (parts[0].toLowerCase() !== "save") parts.unshift("Save");
  else parts[0] = "Save";
  if (parts.length < 2) throw new Error(`Invalid WOLF save path: ${path}`);
  return parts.join("/");
}

function savesFromEntries(entries: RuntimeSaveImportEntry[]): PreparedWolfSave[] {
  const saves = new Map<string, PreparedWolfSave>();
  for (const entry of entries) {
    const path = normalizeSavePath(entry.path);
    saves.set(path.toLowerCase(), {
      path,
      data: new Uint8Array(entry.data),
    });
  }
  return Array.from(saves.values());
}

function pathExists(fileSystem: WolfFileSystem, path: string): boolean {
  try {
    return fileSystem.analyzePath(path).exists;
  } catch {
    return false;
  }
}

function ensureParentDirectories(
  fileSystem: WolfFileSystem,
  root: string,
  relativePath: string,
): void {
  const parts = relativePath.split("/");
  parts.pop();
  let current = root;
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!pathExists(fileSystem, current)) fileSystem.mkdir(current);
  }
}

function syncFileSystem(
  fileSystem: WolfFileSystem,
  populate: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    fileSystem.syncfs(populate, (error) => {
      if (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("WOLF save storage synchronization failed."),
        );
        return;
      }
      resolve();
    });
  });
}

export function installWolfSaveImportBridge(
  gameId: string,
  runtimeModule: WolfRuntimeModule,
  getFileSystem: () => WolfFileSystem,
): void {
  const prepared = new Map<string, PreparedWolfSave[]>();
  const waitingProbes = new Set<string>();
  let fileSystem: WolfFileSystem | undefined;
  let hydrated = false;
  let fallbackHydrationStarted = false;
  let runtimeStartedAt = 0;

  const saveRoot = (): string => {
    if (!runtimeModule.projectId) {
      throw new Error("The WOLF save storage path is unavailable.");
    }
    return `/data0/${runtimeModule.projectId}-Save`;
  };

  const respondReady = (): void => {
    if (!hydrated) return;
    for (const requestId of waitingProbes) {
      postParent({
        type: "save-import-ready",
        requestId,
        gameId,
        engine: "wolf",
      });
    }
    waitingProbes.clear();
  };

  const respondHydrationError = (cause: unknown): void => {
    const message =
      cause instanceof Error
        ? cause.message
        : "WOLF save storage could not be loaded.";
    for (const requestId of waitingProbes) {
      postParent({
        type: "save-import-error",
        requestId,
        gameId,
        engine: "wolf",
        message,
      });
    }
    waitingProbes.clear();
  };

  runtimeModule.preRun.push(() => {
    fileSystem = getFileSystem();
    const originalSync = fileSystem.syncfs;
    fileSystem.syncfs = function(populate, callback) {
      return originalSync.call(fileSystem, populate, (error?: unknown) => {
        if (populate) {
          if (error) respondHydrationError(error);
          else {
            hydrated = true;
            respondReady();
          }
        }
        callback?.(error);
      });
    };
  });

  const prepareRuntime = (): void => {
    if (waitingProbes.size === 0) return;
    if (hydrated) {
      respondReady();
      return;
    }
    if (!runtimeModule.ready) return;
    const wasInitialized = Boolean(runtimeModule.woditor?.initialized);
    (window as InitializeGameWindow).initializeGame?.();
    if (!wasInitialized && runtimeModule.woditor?.initialized) {
      runtimeStartedAt = Date.now();
    }

    if (
      fallbackHydrationStarted ||
      !runtimeModule.woditor?.initialized ||
      runtimeModule.syncing ||
      !fileSystem ||
      (runtimeStartedAt > 0 && Date.now() - runtimeStartedAt < 5_000)
    ) {
      return;
    }
    let rootExists = false;
    try {
      rootExists = pathExists(fileSystem, saveRoot());
    } catch {
      return;
    }
    if (!rootExists) return;

    fallbackHydrationStarted = true;
    void syncFileSystem(fileSystem, true).catch(respondHydrationError);
  };

  const readinessInterval = window.setInterval(prepareRuntime, 100);
  window.addEventListener("pagehide", () => {
    window.clearInterval(readinessInterval);
  }, { once: true });

  window.addEventListener(
    "message",
    (event: MessageEvent<RuntimeSaveImportRequest>) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent ||
        !event.data ||
        event.data.gameId !== gameId ||
        event.data.engine !== "wolf"
      ) {
        return;
      }

      const message = event.data;
      if (message.type === "save-import-probe") {
        waitingProbes.add(message.requestId);
        prepareRuntime();
        return;
      }
      if (message.type === "save-import-abort") {
        waitingProbes.delete(message.requestId);
        prepared.delete(message.requestId);
        return;
      }

      void (async () => {
        try {
          if (!hydrated || !fileSystem) {
            throw new Error("WOLF save storage is not ready.");
          }
          const activeFileSystem = fileSystem;
          const root = saveRoot();
          if (message.type === "save-import-prepare") {
            const saves = savesFromEntries(message.entries);
            const collisionCount = saves.filter(
              (save) =>
                pathExists(activeFileSystem, `${root}/${save.path}`) ||
                pathExists(activeFileSystem, save.path),
            ).length;
            prepared.set(message.requestId, saves);
            postParent({
              type: "save-import-prepared",
              requestId: message.requestId,
              gameId,
              engine: "wolf",
              collisionCount,
              importedEntries: saves.length,
            });
            return;
          }
          if (message.type === "save-import-commit") {
            const saves = prepared.get(message.requestId);
            if (!saves) throw new Error("The WOLF import session expired.");
            for (const save of saves) {
              ensureParentDirectories(activeFileSystem, root, save.path);
              ensureParentDirectories(activeFileSystem, "", save.path);
              activeFileSystem.writeFile(`${root}/${save.path}`, save.data);
              activeFileSystem.writeFile(save.path, save.data);
            }
            await syncFileSystem(activeFileSystem, false);
            prepared.delete(message.requestId);
            postParent({
              type: "save-import-complete",
              requestId: message.requestId,
              gameId,
              engine: "wolf",
              importedEntries: saves.length,
            });
          }
        } catch (cause) {
          prepared.delete(message.requestId);
          postParent({
            type: "save-import-error",
            requestId: message.requestId,
            gameId,
            engine: "wolf",
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      })();
    },
  );
}
