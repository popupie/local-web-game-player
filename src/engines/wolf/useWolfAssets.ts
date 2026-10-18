import { useEffect, useRef, type RefObject } from "react";
import {
  createWolfAssetObjectUrls,
  type WolfAssetObjectUrlSet,
} from "@/src/engines/wolf/assets";
import type { GameRecord, PlayerToParentMessage } from "@/src/lib/types";

interface UseWolfAssetsOptions {
  game?: GameRecord;
  frameRef: RefObject<HTMLIFrameElement | null>;
  onError(message: string): void;
}

export function useWolfAssets({
  game,
  frameRef,
  onError,
}: UseWolfAssetsOptions) {
  const assetsRef = useRef<{
    key: string;
    promise: Promise<WolfAssetObjectUrlSet>;
  } | undefined>(undefined);

  function assetsForActiveGame(): Promise<WolfAssetObjectUrlSet> {
    if (!game) return Promise.reject(new Error("No WOLF game is active."));

    // Woditor can request a new asset long after startup. A settings update must
    // not revoke the active iframe's URLs while the game is still running.
    const current = assetsRef.current;
    if (current?.key === game.id) return current.promise;
    if (current) {
      void current.promise.then((value) => value.release(), () => undefined);
    }

    const promise = createWolfAssetObjectUrls(game.id);
    assetsRef.current = { key: game.id, promise };
    return promise;
  }

  async function respondWithWolfAssets(
    event: MessageEvent<PlayerToParentMessage>,
    message: Extract<PlayerToParentMessage, { type: "wolf-assets-request" }>,
  ) {
    if (
      !game ||
      message.gameId !== game.id ||
      event.source !== frameRef.current?.contentWindow
    ) {
      return;
    }

    try {
      const value = await assetsForActiveGame();
      (event.source as Window).postMessage(
        {
          type: "wolf-assets-response",
          requestId: message.requestId,
          assets: value.assets,
        },
        window.location.origin,
      );
    } catch (cause) {
      const error =
        cause instanceof Error
          ? cause.message
          : "Could not prepare WOLF assets.";
      onError(error);
      (event.source as Window).postMessage(
        {
          type: "wolf-assets-response",
          requestId: message.requestId,
          error,
        },
        window.location.origin,
      );
    }
  }

  useEffect(
    () => () => {
      const current = assetsRef.current;
      if (current) {
        void current.promise.then(
          (value) => value.release(),
          () => undefined,
        );
      }
    },
    [],
  );

  return respondWithWolfAssets;
}
