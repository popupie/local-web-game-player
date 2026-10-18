import {
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  loadDefaultGuardKeys,
  saveDefaultGuardKeys,
} from "@/src/lib/defaultGuardKeys";
import {
  chordFromEvent,
  sameChord,
} from "@/src/lib/keyChords";
import { reservedKeyForEvent } from "@/src/lib/keys";
import {
  defaultDictionaryDismissGuard,
  dictionaryGuardFor,
  overlayTogglePatch,
  playerSettingsForRuntime,
  showTogglePatch,
} from "@/src/lib/playerSettings";
import type {
  DictionaryDismissGuard,
  GameRecord,
  KeyChord,
  ReservedKeyAction,
} from "@/src/lib/types";
import type { useGameLibrary } from "@/src/hooks/useGameLibrary";
import type { usePlayerFrame } from "@/src/hooks/usePlayerFrame";

const unsavedProgressWarning =
  "Leave the current game? Unsaved progress in the game may be lost.";

interface GameControlsOptions {
  library: ReturnType<typeof useGameLibrary>;
  overlayAvailable: boolean;
  player: ReturnType<typeof usePlayerFrame>;
}

export function useGameControls({
  library,
  overlayAvailable,
  player,
}: GameControlsOptions) {
  const [recordingGuardTrigger, setRecordingGuardTrigger] = useState(false);
  const [defaultGuardTriggers, setDefaultGuardTriggers] = useState(() =>
    loadDefaultGuardKeys(),
  );
  const activeDictionaryGuard = library.activeGame
    ? dictionaryGuardFor(library.activeGame)
    : defaultDictionaryDismissGuard;

  useEffect(() => {
    setRecordingGuardTrigger(false);
  }, [library.activeGame?.id]);

  function confirmLeavingActiveGame(nextGameId: string | null) {
    if (!library.activeGame || library.activeGame.id === nextGameId) return true;
    return window.confirm(unsavedProgressWarning);
  }

  async function selectGame(gameId: string) {
    if (confirmLeavingActiveGame(gameId)) {
      await library.setActiveGameId(gameId);
    }
  }

  async function returnHome() {
    if (confirmLeavingActiveGame(null)) {
      await library.setActiveGameId(null);
    }
  }

  async function setGameSettings(
    game: GameRecord,
    patch: Partial<GameRecord["settings"]>,
  ) {
    const updated = await library.saveGameSettings(game, patch);
    player.postPlayerMessage({
      type: "player-settings",
      settings: playerSettingsForRuntime(
        updated.settings,
        defaultGuardTriggers,
      ),
    });
  }

  async function setGameSettingsAndFocus(
    game: GameRecord,
    patch: Partial<GameRecord["settings"]>,
  ) {
    void player.focusPlayer();
    await setGameSettings(game, patch);
    player.scheduleFocusPlayer();
  }

  async function handleReservedAction(action: ReservedKeyAction) {
    const game = library.activeGame;
    if (!game) return;
    if (
      !overlayAvailable &&
      (action === "toggleOverlay" || action === "toggleReader")
    ) {
      return;
    }

    if (action === "toggleOverlay") {
      await setGameSettings(game, overlayTogglePatch(game));
      player.scheduleFocusPlayer();
    }
    if (action === "toggleReader" && game.settings.overlayEnabled) {
      await setGameSettings(game, showTogglePatch(game));
      player.scheduleFocusPlayer();
    }
    if (action === "focusPlayer") player.scheduleFocusPlayer();
    if (action === "fullscreen") await player.requestFullscreen();
  }

  function onAppKeyDown(event: React.KeyboardEvent) {
    const game = library.activeGame;
    if (!game) return;

    const reserved = reservedKeyForEvent(event.nativeEvent, game.settings);
    if (!reserved) return;
    event.preventDefault();
    void handleReservedAction(reserved.action);
  }

  async function setDictionaryGuard(
    game: GameRecord,
    guard: DictionaryDismissGuard,
  ) {
    await setGameSettings(game, { dictionaryDismissGuard: guard });
  }

  function saveDefaultTriggers(triggers: KeyChord[]) {
    setDefaultGuardTriggers(triggers);
    try {
      saveDefaultGuardKeys(triggers);
    } catch {
      library.setError("Could not save the default guard keys.");
    }
  }

  async function saveRecordedGuardTrigger(chord: KeyChord) {
    const game = library.activeGame;
    if (!game) {
      const triggers = defaultGuardTriggers.some((item) =>
        sameChord(item, chord),
      )
        ? defaultGuardTriggers
        : [...defaultGuardTriggers, chord];
      saveDefaultTriggers(triggers);
      return;
    }

    const guard = dictionaryGuardFor(game);
    const matchingDefault = defaultGuardTriggers.find((trigger) =>
      sameChord(trigger, chord),
    );
    if (matchingDefault) {
      await setDictionaryGuard(game, {
        ...guard,
        excludedDefaultTriggers: guard.excludedDefaultTriggers.filter(
          (trigger) => !sameChord(trigger, matchingDefault),
        ),
      });
      return;
    }

    const triggers = guard.triggers.some((item) => sameChord(item, chord))
      ? guard.triggers
      : [...guard.triggers, chord];
    await setDictionaryGuard(game, { ...guard, triggers });
  }

  async function recordGuardTrigger(event: ReactKeyboardEvent) {
    if (!recordingGuardTrigger) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === "Escape") {
      setRecordingGuardTrigger(false);
      return;
    }

    const chord = chordFromEvent(event.nativeEvent);
    if (!chord) return;

    setRecordingGuardTrigger(false);
    await saveRecordedGuardTrigger(chord);
  }

  async function removeGameGuardTrigger(game: GameRecord, index: number) {
    const guard = dictionaryGuardFor(game);
    await setDictionaryGuard(game, {
      ...guard,
      triggers: guard.triggers.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    });
  }

  async function removeDefaultGuardTrigger(index: number) {
    const trigger = defaultGuardTriggers[index];
    if (!trigger) return;

    const game = library.activeGame;
    if (!game) {
      saveDefaultTriggers(
        defaultGuardTriggers.filter((_, itemIndex) => itemIndex !== index),
      );
      return;
    }

    const guard = dictionaryGuardFor(game);
    if (
      guard.excludedDefaultTriggers.some((excluded) =>
        sameChord(excluded, trigger),
      )
    ) {
      return;
    }
    await setDictionaryGuard(game, {
      ...guard,
      excludedDefaultTriggers: [...guard.excludedDefaultTriggers, trigger],
    });
  }

  async function restoreDefaultGuardTrigger(index: number) {
    const trigger = defaultGuardTriggers[index];
    const game = library.activeGame;
    if (!game || !trigger) return;

    const guard = dictionaryGuardFor(game);
    await setDictionaryGuard(game, {
      ...guard,
      excludedDefaultTriggers: guard.excludedDefaultTriggers.filter(
        (excluded) => !sameChord(excluded, trigger),
      ),
    });
  }

  function handleIframeLoad() {
    const game = library.activeGame;
    if (!game) return;

    player.postPlayerMessage({
      type: "player-settings",
      settings: playerSettingsForRuntime(
        game.settings,
        defaultGuardTriggers,
      ),
    });
    player.resetViewportCache();
    player.schedulePlayerViewportNotify();
    window.setTimeout(player.schedulePlayerViewportNotify, 0);
    window.setTimeout(player.schedulePlayerViewportNotify, 250);
  }

  return {
    activeDictionaryGuard,
    defaultGuardTriggers,
    handleIframeLoad,
    handleReservedAction,
    onAppKeyDown,
    recordingGuardTrigger,
    recordGuardTrigger,
    removeDefaultGuardTrigger,
    removeGameGuardTrigger,
    restoreDefaultGuardTrigger,
    returnHome,
    selectGame,
    setDictionaryGuard,
    setGameSettingsAndFocus,
    setRecordingGuardTrigger,
  };
}
