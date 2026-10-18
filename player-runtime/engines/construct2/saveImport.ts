import type {
  RuntimeSaveImportEntry,
  RuntimeSaveImportRequest,
  RuntimeSaveImportResponse,
} from "@/shared/saveImportRuntime";

const DATABASE_NAME = "_C2SaveStates";
const STORE_NAME = "saves";
const RUNTIME_DISCOVERY_TIMEOUT_MS = 15_000;
const RUNTIME_DISCOVERY_INTERVAL_MS = 50;

interface ConstructSave {
  slot: string;
  data: string;
}

interface ConstructActionParameter {
  get(instanceIndex?: number): unknown;
}

interface ConstructAction {
  block?: { actions?: ConstructAction[] };
  func?: unknown;
  parameters?: ConstructActionParameter[];
}

interface ConstructRuntime {
  actsBySid?: Record<string, ConstructAction>;
}

interface ConstructGlobals {
  cr?: {
    plugins_?: {
      LocalStorage?: {
        prototype?: { acts?: { SetItem?: unknown } };
      };
    };
    system_object?: {
      prototype?: { acts?: { SaveState?: unknown; SetVar?: unknown } };
    };
  };
  cr_getC2Runtime?: () => ConstructRuntime | undefined;
  localforage?: {
    setItem(key: string, value: unknown): Promise<unknown> | unknown;
  };
}

interface ConstructMetadataWrite {
  key: string;
  value: unknown;
  variables: Array<{ setValue(value: unknown): void }>;
}

function postParent(message: RuntimeSaveImportResponse): void {
  window.parent.postMessage(message, window.location.origin);
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

function textFromEntry(entry: RuntimeSaveImportEntry): string {
  const text = new TextDecoder().decode(entry.data);
  try {
    const parsed = JSON.parse(text) as { c2save?: unknown };
    if (parsed?.c2save !== true) throw new Error();
  } catch {
    throw new Error(`Invalid Construct 2 save data: ${entry.path}`);
  }
  return text;
}

function savesFromEntries(entries: RuntimeSaveImportEntry[]): ConstructSave[] {
  const saves = new Map<string, ConstructSave>();
  for (const entry of entries) {
    const slot = slotForPath(entry.path);
    if (!slot) {
      throw new Error(`Invalid Construct 2 save path: ${entry.path}`);
    }
    saves.set(slot, { slot, data: textFromEntry(entry) });
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

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function actionParameter(action: ConstructAction, index: number): unknown {
  try {
    return action.parameters?.[index]?.get(0);
  } catch {
    return undefined;
  }
}

function metadataWritesForSaves(
  runtime: ConstructRuntime,
  globals: ConstructGlobals,
  saves: ConstructSave[],
): ConstructMetadataWrite[] {
  const saveState = globals.cr?.system_object?.prototype?.acts?.SaveState;
  const setVariable = globals.cr?.system_object?.prototype?.acts?.SetVar;
  const setItem =
    globals.cr?.plugins_?.LocalStorage?.prototype?.acts?.SetItem;
  if (!saveState || !setItem) return [];

  const importedSlots = new Set(saves.map((save) => save.slot));
  const writes = new Map<string, ConstructMetadataWrite>();
  for (const action of Object.values(runtime.actsBySid ?? {})) {
    if (
      action.func !== saveState ||
      !importedSlots.has(String(actionParameter(action, 0) ?? ""))
    ) {
      continue;
    }
    const siblings = action.block?.actions ?? [];
    const saveIndex = siblings.indexOf(action);
    for (let index = saveIndex + 1; index < siblings.length; index += 1) {
      const sibling = siblings[index];
      if (sibling.func !== setItem) continue;
      const key = actionParameter(sibling, 0);
      const value = actionParameter(sibling, 1);
      if (
        typeof key !== "string" ||
        !key ||
        (typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "boolean")
      ) {
        continue;
      }
      const variables = siblings
        .slice(saveIndex + 1, index)
        .filter(
          (candidate) =>
            candidate.func === setVariable &&
            actionParameter(candidate, 1) === value,
        )
        .map((candidate) => actionParameter(candidate, 0))
        .filter(
          (variable): variable is { setValue(value: unknown): void } =>
            typeof (variable as { setValue?: unknown } | undefined)?.setValue ===
            "function",
        );
      const existing = writes.get(key);
      writes.set(key, {
        key,
        value,
        variables: [...(existing?.variables ?? []), ...variables],
      });
    }
  }
  return Array.from(writes.values());
}

async function restoreSaveAvailabilityMetadata(
  saves: ConstructSave[],
): Promise<void> {
  const globals = window as typeof window & ConstructGlobals;
  const deadline = Date.now() + RUNTIME_DISCOVERY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const runtime = globals.cr_getC2Runtime?.();
    if (runtime?.actsBySid && Object.keys(runtime.actsBySid).length > 0) {
      const writes = metadataWritesForSaves(runtime, globals, saves);
      if (writes.length === 0) return;
      if (!globals.localforage) {
        await wait(RUNTIME_DISCOVERY_INTERVAL_MS);
        continue;
      }
      await Promise.all(
        writes.map(({ key, value }) =>
          Promise.resolve(globals.localforage?.setItem(key, value)),
        ),
      );
      for (const { value, variables } of writes) {
        for (const variable of variables) variable.setValue(value);
      }
      return;
    }
    await wait(RUNTIME_DISCOVERY_INTERVAL_MS);
  }
}

async function restoreStoredSaveAvailabilityMetadata(): Promise<void> {
  const globals = window as typeof window & ConstructGlobals;
  const deadline = Date.now() + RUNTIME_DISCOVERY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const runtime = globals.cr_getC2Runtime?.();
    if (runtime?.actsBySid && Object.keys(runtime.actsBySid).length > 0) {
      const saves = await storedSaves();
      if (saves.length > 0) await restoreSaveAvailabilityMetadata(saves);
      return;
    }
    await wait(RUNTIME_DISCOVERY_INTERVAL_MS);
  }
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

async function collisionCount(saves: ConstructSave[]): Promise<number> {
  const database = await openSaveDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const done = transactionDone(transaction);
    const collisions = await Promise.all(
      saves.map(async (save) => {
        const indexedDbRecord = await requestResult(store.getKey(save.slot));
        return (
          indexedDbRecord !== undefined ||
          window.localStorage.getItem(`__c2save_${save.slot}`) !== null
        );
      }),
    );
    await done;
    return collisions.filter(Boolean).length;
  } finally {
    database.close();
  }
}

async function storedSaves(): Promise<ConstructSave[]> {
  const database = await openSaveDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const records = await requestResult(
      transaction.objectStore(STORE_NAME).getAll(),
    );
    await done;
    return records.filter(
      (record): record is ConstructSave =>
        typeof record?.slot === "string" && typeof record?.data === "string",
    );
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
  await restoreSaveAvailabilityMetadata(saves);
}

export function installConstruct2SaveImportBridge(gameId: string): void {
  const prepared = new Map<string, ConstructSave[]>();

  void restoreStoredSaveAvailabilityMetadata().catch(() => {
    // Save import still works when a project does not use C2 Local Storage.
  });

  window.addEventListener("message", (event: MessageEvent<RuntimeSaveImportRequest>) => {
    if (
      event.origin !== window.location.origin ||
      event.source !== window.parent ||
      !event.data ||
      event.data.gameId !== gameId ||
      event.data.engine !== "construct-2"
    ) {
      return;
    }

    const message = event.data;
    if (message.type === "save-import-probe") {
      postParent({
        type: "save-import-ready",
        requestId: message.requestId,
        gameId,
        engine: "construct-2",
      });
      return;
    }
    if (message.type === "save-import-abort") {
      prepared.delete(message.requestId);
      return;
    }

    void (async () => {
      try {
        if (message.type === "save-import-prepare") {
          const saves = savesFromEntries(message.entries);
          const collisions = await collisionCount(saves);
          prepared.set(message.requestId, saves);
          postParent({
            type: "save-import-prepared",
            requestId: message.requestId,
            gameId,
            engine: "construct-2",
            collisionCount: collisions,
            importedEntries: saves.length,
          });
          return;
        }
        if (message.type === "save-import-commit") {
          const saves = prepared.get(message.requestId);
          if (!saves) throw new Error("The Construct 2 import session expired.");
          await commitSaves(saves);
          prepared.delete(message.requestId);
          postParent({
            type: "save-import-complete",
            requestId: message.requestId,
            gameId,
            engine: "construct-2",
            importedEntries: saves.length,
          });
        }
      } catch (cause) {
        prepared.delete(message.requestId);
        postParent({
          type: "save-import-error",
          requestId: message.requestId,
          gameId,
          engine: "construct-2",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    })();
  });
}
