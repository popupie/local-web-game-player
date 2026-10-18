import { normalizeStoredPath } from "@/src/lib/paths";
import { getStoredFilesForGame } from "@/src/lib/storage";
import { isCocosGame } from "@/src/engines/cocos/detect";
import { isConstruct2Game } from "@/src/engines/construct2/detect";
import { isRpgMakerGame } from "@/src/engines/rpgmaker_mvmz/detect";
import { isTyranoGame } from "@/src/engines/tyrano/detect";
import type { GameEngine } from "@/src/engines/types";
import { isWolfGame } from "@/src/engines/wolf/detect";

export async function detectGameEngine(gameId: string): Promise<GameEngine> {
  const paths = (await getStoredFilesForGame(gameId)).map((record) =>
    normalizeStoredPath(record.path).toLowerCase(),
  );
  if (isWolfGame(paths)) return "wolf";
  if (isConstruct2Game(paths)) return "construct-2";
  if (isTyranoGame(paths)) return "tyrano";
  if (isRpgMakerGame(paths)) return "rpg-maker";
  if (isCocosGame(paths)) return "cocos";
  return "unknown";
}
