import type { KeyChord } from "@/src/lib/types";
import { normalizeGuardTriggers } from "@/src/lib/playerSettings";

const storageKey = "mvmz-browser-player:default-guard-keys";

type GuardKeyStorage = Pick<Storage, "getItem" | "setItem">;

export function loadDefaultGuardKeys(
  storage: GuardKeyStorage = window.localStorage,
): KeyChord[] {
  try {
    const saved = storage.getItem(storageKey);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? normalizeGuardTriggers(parsed) : [];
  } catch {
    return [];
  }
}

export function saveDefaultGuardKeys(
  triggers: KeyChord[],
  storage: GuardKeyStorage = window.localStorage,
): void {
  storage.setItem(storageKey, JSON.stringify(normalizeGuardTriggers(triggers)));
}
