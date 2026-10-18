import { installRuntimeSaveImportBridge } from "@/player-runtime/saveImportBridge";
import type { RuntimeSaveImportEntry } from "@/shared/saveImportRuntime";

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

function normalizeSavePath(path: string): string {
  let normalized = path.replaceAll("\\", "/");
  const saveRoot = normalized.toLowerCase().indexOf("-save/");
  if (saveRoot >= 0) normalized = normalized.slice(saveRoot + "-save/".length);
  normalized = normalized.replace(/^\/+/u, "");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);

  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") throw new Error(`Invalid WOLF save path: ${path}`);
    parts.push(part);
  }
  if (parts.length === 0) throw new Error(`Invalid WOLF save path: ${path}`);
  if (parts[0].toLowerCase() !== "save") parts.unshift("Save");
  else parts[0] = "Save";
  if (parts.length < 2) throw new Error(`Invalid WOLF save path: ${path}`);
  return parts.join("/");
}

function savesFromEntries(
  entries: RuntimeSaveImportEntry[],
): PreparedWolfSave[] {
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

function createSaveStorage(
  runtimeModule: WolfRuntimeModule,
  getFileSystem: () => WolfFileSystem,
): {
  fileSystem: () => WolfFileSystem;
  root: () => string;
  ready: () => Promise<void>;
} {
  let fileSystem: WolfFileSystem | undefined;
  let hydrated = false;
  let settled = false;
  let fallbackHydrationStarted = false;
  let runtimeStartedAt = 0;
  let readinessInterval: number | undefined;
  let resolveHydration!: () => void;
  let rejectHydration!: (cause: unknown) => void;

  const hydration = new Promise<void>((resolve, reject) => {
    resolveHydration = resolve;
    rejectHydration = reject;
  });
  void hydration.catch(() => undefined);

  const clearReadinessInterval = (): void => {
    if (readinessInterval === undefined) return;
    window.clearInterval(readinessInterval);
    readinessInterval = undefined;
  };

  const finishHydration = (error?: unknown): void => {
    if (settled) return;
    settled = true;
    clearReadinessInterval();
    if (error) {
      rejectHydration(
        error instanceof Error
          ? error
          : new Error("WOLF save storage could not be loaded."),
      );
      return;
    }
    hydrated = true;
    resolveHydration();
  };

  const root = (): string => {
    if (!runtimeModule.projectId) {
      throw new Error("The WOLF save storage path is unavailable.");
    }
    return `/data0/${runtimeModule.projectId}-Save`;
  };

  runtimeModule.preRun.push(() => {
    const activeFileSystem = getFileSystem();
    fileSystem = activeFileSystem;
    const originalSync = activeFileSystem.syncfs;
    activeFileSystem.syncfs = function (populate, callback) {
      return originalSync.call(
        activeFileSystem,
        populate,
        (error?: unknown) => {
          if (populate) finishHydration(error);
          callback?.(error);
        },
      );
    };
  });

  const prepareRuntime = (): void => {
    if (settled || !runtimeModule.ready) return;

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
    let saveRoot: string;
    try {
      saveRoot = root();
    } catch {
      return;
    }
    if (!pathExists(fileSystem, saveRoot)) return;

    fallbackHydrationStarted = true;
    void syncFileSystem(fileSystem, true).then(
      () => finishHydration(),
      finishHydration,
    );
  };

  window.addEventListener("pagehide", () => clearReadinessInterval(), {
    once: true,
  });

  return {
    fileSystem() {
      if (!hydrated || !fileSystem) {
        throw new Error("WOLF save storage is not ready.");
      }
      return fileSystem;
    },
    root,
    async ready() {
      if (!settled && readinessInterval === undefined) {
        readinessInterval = window.setInterval(prepareRuntime, 100);
        prepareRuntime();
      }
      await hydration;
    },
  };
}

export function installWolfSaveImportBridge(
  gameId: string,
  runtimeModule: WolfRuntimeModule,
  getFileSystem: () => WolfFileSystem,
): void {
  const storage = createSaveStorage(runtimeModule, getFileSystem);

  installRuntimeSaveImportBridge<PreparedWolfSave[]>(gameId, {
    engine: "wolf",
    expiredSessionMessage: "The WOLF import session expired.",
    ready: storage.ready,
    async prepare(entries) {
      const saves = savesFromEntries(entries);
      const fileSystem = storage.fileSystem();
      const root = storage.root();
      return {
        collisionCount: saves.filter(
          ({ path }) =>
            pathExists(fileSystem, `${root}/${path}`) ||
            pathExists(fileSystem, path),
        ).length,
        importedEntries: saves.length,
        value: saves,
      };
    },
    async commit(saves) {
      const fileSystem = storage.fileSystem();
      const root = storage.root();
      for (const save of saves) {
        ensureParentDirectories(fileSystem, root, save.path);
        ensureParentDirectories(fileSystem, "", save.path);
        fileSystem.writeFile(`${root}/${save.path}`, save.data);
        fileSystem.writeFile(save.path, save.data);
      }
      await syncFileSystem(fileSystem, false);
    },
  });
}
