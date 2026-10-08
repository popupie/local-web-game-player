import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { LibraryPanel } from "./components/LibraryPanel";
import { PlayerPanel } from "./components/PlayerPanel";
import { useGameLibrary } from "./hooks/useGameLibrary";
import { usePlayerFrame } from "./hooks/usePlayerFrame";
import { useTextLog } from "./hooks/useTextLog";
import { chordFromEvent, sameChord } from "./lib/keyChords";
import { reservedKeyForEvent } from "./lib/keys";
import { defaultDictionaryDismissGuard, dictionaryGuardFor, overlayTogglePatch, showTogglePatch } from "./lib/playerSettings";
import { createWolfAssetObjectUrls, type WolfAssetObjectUrlSet } from "./lib/wolfAssets";
import type { DictionaryDismissGuard, GameRecord, PlayerToParentMessage } from "./lib/types";

const textLogLimit = 100;
const serviceTitle = "Local Web Game Player";
const unsavedProgressWarning = "Leave the current game? Unsaved progress in the game may be lost.";

export default function App() {
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [overlayAvailability, setOverlayAvailability] = useState<{
    gameId: string;
    available: boolean;
  } | null>(null);
  const [recordingGuardTrigger, setRecordingGuardTrigger] = useState(false);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const wolfAssetsRef = useRef<{
    key: string;
    promise: Promise<WolfAssetObjectUrlSet>;
  } | undefined>(undefined);

  const library = useGameLibrary(() => setRuntimeError(null));
  const player = usePlayerFrame(library.activeGame?.id);
  const {
    append: appendTextLogEntry,
    logsOpen,
    reset: resetTextLog,
    setLogsOpen,
    textLogs,
  } = useTextLog(textLogLimit);
  const activeDictionaryGuard = library.activeGame ? dictionaryGuardFor(library.activeGame) : defaultDictionaryDismissGuard;
  const overlayAvailable = Boolean(
    library.activeGame
    && overlayAvailability?.gameId === library.activeGame.id
    && overlayAvailability.available,
  );
  const quotaPercent = library.storage?.quota && library.storage.usage ? Math.min(100, Math.round((library.storage.usage / library.storage.quota) * 100)) : 0;
  function wolfAssetsForActiveGame(): Promise<WolfAssetObjectUrlSet> {
    const game = library.activeGame;
    if (!game) return Promise.reject(new Error("No WOLF game is active."));
    // Woditor can request a new asset long after startup. A settings update must
    // not revoke the active iframe's URLs while the game is still running.
    const key = game.id;
    const current = wolfAssetsRef.current;
    if (current?.key === key) return current.promise;
    if (current) void current.promise.then((value) => value.release(), () => undefined);
    const promise = createWolfAssetObjectUrls(game.id);
    wolfAssetsRef.current = { key, promise };
    return promise;
  }

  async function respondWithWolfAssets(
    event: MessageEvent<PlayerToParentMessage>,
    message: Extract<PlayerToParentMessage, { type: "wolf-assets-request" }>,
  ) {
    const game = library.activeGame;
    if (
      !game ||
      message.gameId !== game.id ||
      event.source !== player.frameRef.current?.contentWindow
    ) return;

    try {
      const value = await wolfAssetsForActiveGame();
      (event.source as Window).postMessage({
        type: "wolf-assets-response",
        requestId: message.requestId,
        assets: value.assets,
      }, window.location.origin);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : "Could not prepare WOLF assets.";
      setRuntimeError(error);
      (event.source as Window).postMessage({
        type: "wolf-assets-response",
        requestId: message.requestId,
        error,
      }, window.location.origin);
    }
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent<PlayerToParentMessage>) => {
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") return;
      const message = event.data;
      if (message.type === "wolf-assets-request") {
        void respondWithWolfAssets(event, message);
        return;
      }
      if (message.type === "overlay-availability") {
        setOverlayAvailability({ gameId: message.gameId, available: message.available });
      }
      if (message.type === "reserved-key") {
        void handleReservedAction(message.action);
      }
      if (message.type === "return-focus") {
        void player.focusPlayer();
      }
      if (message.type === "text-log" && message.gameId === library.activeGame?.id) {
        appendTextLogEntry(message.text);
      }
      if (message.type === "runtime-error") {
        setRuntimeError(message.message);
      }
      if (message.type === "game-viewport" && message.width > 0 && message.height > 0) {
        player.setGameAspectRatio(message.width / message.height);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });

  useEffect(() => {
    resetTextLog();
    setRecordingGuardTrigger(false);
  }, [library.activeGame?.id, resetTextLog]);

  useEffect(() => {
    document.title = library.activeGame ? `${library.activeGame.title} | ${serviceTitle}` : serviceTitle;
  }, [library.activeGame]);

  useEffect(() => {
    if (!library.activeGame) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [library.activeGame]);

  function confirmLeavingActiveGame(nextGameId: string | null) {
    if (!library.activeGame || library.activeGame.id === nextGameId) return true;
    return window.confirm(unsavedProgressWarning);
  }

  async function selectGame(gameId: string) {
    if (!confirmLeavingActiveGame(gameId)) return;
    await library.setActiveGameId(gameId);
  }

  async function returnHome() {
    if (!confirmLeavingActiveGame(null)) return;
    await library.setActiveGameId(null);
  }

  async function setGameSettings(game: GameRecord, patch: Partial<GameRecord["settings"]>) {
    const updated = await library.saveGameSettings(game, patch);
    player.postPlayerMessage({ type: "player-settings", settings: updated.settings });
  }

  async function setGameSettingsAndFocus(game: GameRecord, patch: Partial<GameRecord["settings"]>) {
    void player.focusPlayer();
    await setGameSettings(game, patch);
    player.scheduleFocusPlayer();
  }

  async function handleReservedAction(action: string) {
    if (!library.activeGame) return;
    if (!overlayAvailable && (action === "toggleOverlay" || action === "toggleReader")) return;
    if (action === "toggleOverlay") {
      await setGameSettings(library.activeGame, overlayTogglePatch(library.activeGame));
      player.scheduleFocusPlayer();
    }
    if (action === "toggleReader") {
      if (!library.activeGame.settings.overlayEnabled) return;
      await setGameSettings(library.activeGame, showTogglePatch(library.activeGame));
      player.scheduleFocusPlayer();
    }
    if (action === "focusPlayer") {
      player.scheduleFocusPlayer();
    }
    if (action === "fullscreen") {
      await player.requestFullscreen();
    }
  }

  function onAppKeyDown(event: ReactKeyboardEvent) {
    if (!library.activeGame) return;
    const reserved = reservedKeyForEvent(event.nativeEvent, library.activeGame.settings);
    if (!reserved) return;
    event.preventDefault();
    void handleReservedAction(reserved.action);
  }

  async function setDictionaryGuard(game: GameRecord, guard: DictionaryDismissGuard) {
    await setGameSettings(game, { dictionaryDismissGuard: guard });
  }

  async function recordGuardTrigger(game: GameRecord, event: ReactKeyboardEvent) {
    if (!recordingGuardTrigger) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === "Escape") {
      setRecordingGuardTrigger(false);
      return;
    }
    const chord = chordFromEvent(event.nativeEvent);
    if (!chord) return;
    const guard = dictionaryGuardFor(game);
    const triggers = guard.triggers.some((item) => sameChord(item, chord)) ? guard.triggers : [...guard.triggers, chord];
    setRecordingGuardTrigger(false);
    await setDictionaryGuard(game, { ...guard, triggers });
  }

  async function removeGuardTrigger(game: GameRecord, index: number) {
    const guard = dictionaryGuardFor(game);
    await setDictionaryGuard(game, {
      ...guard,
      triggers: guard.triggers.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function handleIframeLoad() {
    if (!library.activeGame) return;
    player.postPlayerMessage({ type: "player-settings", settings: library.activeGame.settings });
    player.resetViewportCache();
    player.schedulePlayerViewportNotify();
    window.setTimeout(player.schedulePlayerViewportNotify, 0);
    window.setTimeout(player.schedulePlayerViewportNotify, 250);
  }

  return (
    <main className="app-shell" onKeyDown={onAppKeyDown}>
      <LibraryPanel
        activeGame={library.activeGame}
        activeGuard={activeDictionaryGuard}
        boundSessionGameIds={library.boundSessionGameIds}
        directoryInputRef={directoryInputRef}
        error={library.error}
        games={library.games}
        guardAvailable={overlayAvailable}
        notice={library.notice}
        clearStorage={() => void library.clearStorage()}
        downloadSaves={(game) => void library.downloadSaves(game)}
        openFolder={() => {
          if (library.canUseLocalFolderAccess) {
            void library.openLocalFolder();
            return;
          }
          directoryInputRef.current?.click();
        }}
        importFolder={library.importFolder}
        importZip={library.importZip}
        progress={library.progress}
        quotaPercent={quotaPercent}
        recordingGuardTrigger={recordingGuardTrigger}
        removeGame={(game) => void library.removeGame(game)}
        bindSessionFolder={(game) => void library.bindSessionFolder(game)}
        removeGuardTrigger={(game, index) => void removeGuardTrigger(game, index)}
        recordGuardTrigger={(game, event) => void recordGuardTrigger(game, event)}
        resetError={() => library.setError(null)}
        resetNotice={() => library.setNotice(null)}
        setActiveGameId={(gameId) => void selectGame(gameId)}
        setIdle={() => void returnHome()}
        setDictionaryGuard={(game, guard) => void setDictionaryGuard(game, guard)}
        setRecordingGuardTrigger={setRecordingGuardTrigger}
        storage={library.storage}
        zipInputRef={zipInputRef}
      />

      <PlayerPanel
        activeGame={library.activeGame}
        focusPlayer={() => void player.focusPlayer()}
        frameRef={player.frameRef}
        frameWrapRef={player.frameWrapRef}
        gameAspectRatio={player.gameAspectRatio}
        logsOpen={logsOpen}
        overlayAvailable={overlayAvailable}
        onIframeLoad={handleIframeLoad}
        onRequestFullscreen={() => void handleReservedAction("fullscreen")}
        onToggleOverlay={(game) => void setGameSettingsAndFocus(game, overlayTogglePatch(game))}
        onToggleShow={(game) => void setGameSettingsAndFocus(game, showTogglePatch(game))}
        resetRuntimeError={() => setRuntimeError(null)}
        runtimeError={runtimeError}
        setLogsOpen={setLogsOpen}
        textLogLimit={textLogLimit}
        textLogs={textLogs}
      />
    </main>
  );
}
