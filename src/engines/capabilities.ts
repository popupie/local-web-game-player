import type { GameEngine } from "@/src/engines/types";

const SAVE_IMPORT_ENGINES = new Set<GameEngine>([
  "rpg-maker",
  "tyrano",
  "cocos",
  "wolf",
  "construct-2",
]);

export function supportsSaveImport(engine: GameEngine | undefined): boolean {
  return engine !== undefined && SAVE_IMPORT_ENGINES.has(engine);
}

export function saveImportUnavailableReason(
  engine: GameEngine | undefined,
): string {
  if (engine === undefined) return "Checking save import support…";
  return "Save import is unavailable for this game engine.";
}
