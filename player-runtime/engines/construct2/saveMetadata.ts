const RUNTIME_DISCOVERY_TIMEOUT_MS = 15_000;
const RUNTIME_DISCOVERY_INTERVAL_MS = 50;

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

interface MetadataWrite {
  key: string;
  value: string | number | boolean;
  variables: Array<{ setValue(value: unknown): void }>;
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

function isMetadataValue(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function metadataWritesForSlots(
  runtime: ConstructRuntime,
  globals: ConstructGlobals,
  slots: Set<string>,
): MetadataWrite[] {
  const saveState = globals.cr?.system_object?.prototype?.acts?.SaveState;
  const setVariable = globals.cr?.system_object?.prototype?.acts?.SetVar;
  const setItem = globals.cr?.plugins_?.LocalStorage?.prototype?.acts?.SetItem;
  if (!saveState || !setItem) return [];

  const writes = new Map<string, MetadataWrite>();
  for (const action of Object.values(runtime.actsBySid ?? {})) {
    const slot = String(actionParameter(action, 0) ?? "");
    if (action.func !== saveState || !slots.has(slot)) continue;

    const siblings = action.block?.actions ?? [];
    const saveIndex = siblings.indexOf(action);
    for (let index = saveIndex + 1; index < siblings.length; index += 1) {
      const setItemAction = siblings[index];
      if (setItemAction.func !== setItem) continue;

      const key = actionParameter(setItemAction, 0);
      const value = actionParameter(setItemAction, 1);
      if (typeof key !== "string" || !key || !isMetadataValue(value)) continue;

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
            typeof (variable as { setValue?: unknown } | undefined)
              ?.setValue === "function",
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

export async function restoreConstruct2SaveMetadata(
  slots: Iterable<string>,
): Promise<void> {
  const importedSlots = new Set(slots);
  if (importedSlots.size === 0) return;

  const globals = window as typeof window & ConstructGlobals;
  const deadline = Date.now() + RUNTIME_DISCOVERY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const runtime = globals.cr_getC2Runtime?.();
    if (!runtime?.actsBySid || Object.keys(runtime.actsBySid).length === 0) {
      await wait(RUNTIME_DISCOVERY_INTERVAL_MS);
      continue;
    }

    const writes = metadataWritesForSlots(runtime, globals, importedSlots);
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
}
