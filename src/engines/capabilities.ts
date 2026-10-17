import type { GameEngine } from "@/src/engines/types";

const SAVE_IMPORT_ENGINES = new Set<GameEngine>([
  "rpg-maker",
  "tyrano",
  "cocos",
]);

export function supportsSaveImport(engine: GameEngine | undefined): boolean {
  return engine !== undefined && SAVE_IMPORT_ENGINES.has(engine);
}

export function saveImportUnavailableReason(
  engine: GameEngine | undefined,
): string {
  if (engine === undefined) return "Checking save import support…";
  if (engine === "wolf") return "Save import is not supported for WOLF RPG.";
  if (engine === "construct-2") {
    return "Save import is not supported for Construct 2.";
  }
  return "Save import is unavailable for this game engine.";
}
