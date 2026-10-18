import { normalizeStoredPath } from "@/src/lib/paths";
import type { IndexedDbRecord } from "@/src/lib/saveTypes";
import {
  createSaveImportFrame,
  importSavesThroughRuntime,
  type RuntimeSaveEntry,
  type RuntimeSaveImportResult,
} from "@/src/lib/runtimeSaveImport";
import type { GameRecord } from "@/src/lib/types";
import { createWolfAssetObjectUrls } from "@/src/engines/wolf/assets";
import type { WolfPlayerToParentMessage } from "@/src/engines/wolf/messages";

export function wolfSaveRelativePath(path: string): string | undefined {
  let normalized = normalizeStoredPath(path);
  const saveRoot = normalized.toLowerCase().indexOf("-save/");
  if (saveRoot >= 0) {
    normalized = normalized.slice(saveRoot + "-Save/".length);
  }
  if (!normalized.toLowerCase().startsWith("save/")) return undefined;
  return normalized;
}

export function isWolfIndexedDbSaveRecord(record: IndexedDbRecord): boolean {
  return (
    isWolfSaveDatabase(record.database) &&
    record.store === "FILE_DATA" &&
    typeof record.key === "string" &&
    Boolean(wolfSaveRelativePath(record.key))
  );
}

export function isWolfIndexedDbRecord(record: IndexedDbRecord): boolean {
  return isWolfSaveDatabase(record.database);
}

export function isWolfSaveDatabase(database: string): boolean {
  return database.endsWith("-Save");
}

export async function importWolfSaves(
  game: GameRecord,
  entries: RuntimeSaveEntry[],
  options: {
    confirmOverwrite?: (collisionCount: number) => boolean | Promise<boolean>;
    frame?: HTMLIFrameElement;
  } = {},
): Promise<RuntimeSaveImportResult> {
  const ownsFrame = !options.frame;
  const frame = options.frame ?? createSaveImportFrame(game);
  let assetsPromise: ReturnType<typeof createWolfAssetObjectUrls> | undefined;

  const respondWithAssets = (
    event: MessageEvent<WolfPlayerToParentMessage>,
  ): void => {
    const message = event.data;
    if (
      !ownsFrame ||
      event.origin !== window.location.origin ||
      event.source !== frame.contentWindow ||
      message?.type !== "wolf-assets-request" ||
      message.gameId !== game.id
    ) {
      return;
    }
    assetsPromise ??= createWolfAssetObjectUrls(game.id);
    void assetsPromise.then(
      (value) => {
        (event.source as Window).postMessage(
          {
            type: "wolf-assets-response",
            requestId: message.requestId,
            assets: value.assets,
          },
          window.location.origin,
        );
      },
      (cause) => {
        (event.source as Window).postMessage(
          {
            type: "wolf-assets-response",
            requestId: message.requestId,
            error: cause instanceof Error ? cause.message : String(cause),
          },
          window.location.origin,
        );
      },
    );
  };

  if (ownsFrame) {
    window.addEventListener("message", respondWithAssets);
    document.body.append(frame);
  }
  try {
    return await importSavesThroughRuntime(game, "wolf", entries, {
      confirmOverwrite: options.confirmOverwrite,
      frame,
    });
  } finally {
    if (ownsFrame) {
      window.removeEventListener("message", respondWithAssets);
      frame.remove();
      void assetsPromise?.then((value) => value.release(), () => undefined);
    }
  }
}
