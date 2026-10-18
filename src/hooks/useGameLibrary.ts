import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  saveImportUnavailableReason,
  supportsSaveImport,
} from "@/src/engines/capabilities";
import { detectGameEngine } from "@/src/engines/detect";
import type { GameEngine } from "@/src/engines/types";
import {
  bindSessionFolderCandidate,
  candidateFromDirectoryHandle,
  candidateFromFolder,
  candidateFromZip,
  importCandidate,
  importLocalFolderCandidate,
  importSessionFolderCandidate,
  isPlaceholderGameTitle,
} from "@/src/lib/importer";
import {
  chooseWebkitFolder,
  localFolderAccessError,
  pickLocalFolder,
  requestLocalFolderPermission,
  selectedFolderName,
  supportsLocalFolderAccess,
  type DirectoryInputElement,
} from "@/src/lib/folderAccess";
import {
  clearAllGameStorageNamespaces,
  clearGameStorageNamespace,
} from "@/src/lib/keys";
import { normalizePlayerSettings } from "@/src/lib/playerSettings";
import {
  clearServiceWorkerGameCache,
  clearServiceWorkerPlayerCache,
  listenForSessionFileRequests,
} from "@/src/lib/playerCache";
import { downloadSaveZip } from "@/src/lib/saveExport";
import {
  clearAllGameIndexedDbSaves,
  clearGameIndexedDbSaves,
} from "@/src/lib/saveCleanup";
import { importSaveFile, importSaveFolder } from "@/src/lib/saveImport";
import { registerPlayerServiceWorker } from "@/src/lib/serviceWorker";
import {
  clearAllSessionFolders,
  clearSessionFolder,
  hasSessionFolder,
  registerSessionFolder,
} from "@/src/lib/sessionFiles";
import {
  clearPlayerStorage,
  deleteGame,
  estimateStorage,
  getAllGames,
  putGame,
  updateGameSettings,
} from "@/src/lib/storage";
import {
  browserStorageError,
  estimateStorageAfterMutation,
  importErrorMessage,
} from "@/src/lib/storageQuota";
import type {
  GameRecord,
  ImportCandidate,
  ImportProgress,
} from "@/src/lib/types";

const idleProgress: ImportProgress = {
  phase: "idle",
  label: "",
  completed: 0,
  total: 0,
};

type ImportCandidateReader = () => Promise<ImportCandidate>;

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
}

export function useGameLibrary(onImportStart?: () => void) {
  const [games, setGames] = useState<GameRecord[]>([]);
  const [gameEngines, setGameEngines] = useState<Record<string, GameEngine>>(
    {},
  );
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress>(idleProgress);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageEstimate | undefined>();

  const activeGame = useMemo(
    () => games.find((game) => game.id === activeGameId),
    [activeGameId, games],
  );
  const boundSessionGameIds = useMemo(
    () =>
      new Set(
        games
          .filter(
            (game) =>
              game.sourceKind === "session-folder" && hasSessionFolder(game.id),
          )
          .map((game) => game.id),
      ),
    [games],
  );

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    if (!notice) return;

    const timeoutId = window.setTimeout(() => {
      setNotice(null);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    if (!error) return;

    const timeoutId = window.setTimeout(() => {
      setError(null);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [error]);

  useEffect(() => listenForSessionFileRequests(), []);

  async function boot() {
    setError(null);
    setNotice(null);
    try {
      await registerPlayerServiceWorker();
      await refreshGames();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start the browser player.",
      );
    }
  }

  async function refreshGames(nextActiveId?: string) {
    const nextGames = (await getAllGames()).map((game) => ({
      ...game,
      settings: normalizePlayerSettings(game.settings),
    }));
    setGames(nextGames);
    const engineEntries = await Promise.all(
      nextGames.map(async (game) => {
        try {
          return [game.id, await detectGameEngine(game.id)] as const;
        } catch {
          return [game.id, "unknown"] as const;
        }
      }),
    );
    setGameEngines(Object.fromEntries(engineEntries));
    setStorage(await estimateStorage());
    if (nextActiveId) {
      setActiveGameId(nextActiveId);
    }
  }

  async function importFolder(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target as DirectoryInputElement;
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      event.target.value = "";
      setError("No files were selected.");
      return;
    }

    try {
      setError(null);
      setNotice(null);
      onImportStart?.();
      setProgress({
        phase: "reading",
        label: "Reading folder",
        completed: 0,
        total: 1,
      });
      await waitForNextPaint();
      const candidate = await candidateFromFolder(
        files,
        selectedFolderName(input, files),
      );
      const game = await importSessionFolderCandidate(candidate, setProgress);
      registerSessionFolder(game.id, candidate.files);
      clearServiceWorkerGameCache(game.id);
      await refreshGames(game.id);
      setProgress(idleProgress);
    } catch (cause) {
      setProgress(idleProgress);
      setError(cause instanceof Error ? cause.message : "Folder open failed.");
    } finally {
      event.target.value = "";
    }
  }

  async function openLocalFolder() {
    const supportError = localFolderAccessError();
    if (supportError) {
      setError(supportError);
      return;
    }

    setError(null);
    setNotice(null);
    onImportStart?.();
    try {
      setProgress({
        phase: "reading",
        label: "Choose a folder",
        completed: 0,
        total: 1,
      });
      const handle = await pickLocalFolder();
      setProgress({
        phase: "reading",
        label: "Scanning folder",
        completed: 0,
        total: 1,
      });
      await waitForNextPaint();
      const candidate = await candidateFromDirectoryHandle(handle, setProgress);
      const game = await importLocalFolderCandidate(candidate, setProgress);
      clearServiceWorkerGameCache(game.id);
      await refreshGames(game.id);
      setProgress(idleProgress);
    } catch (cause) {
      setProgress(idleProgress);
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Folder open failed.");
    }
  }

  async function importZip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      event.target.value = "";
      return;
    }

    const compressedStorageError = await browserStorageError(file.size);
    if (compressedStorageError) {
      event.target.value = "";
      setError(compressedStorageError);
      return;
    }

    try {
      await runImport(async () => candidateFromZip(file, setProgress));
    } finally {
      event.target.value = "";
    }
  }

  async function runImport(readCandidate: ImportCandidateReader) {
    setError(null);
    setNotice(null);
    onImportStart?.();
    try {
      setProgress({
        phase: "reading",
        label: "Reading files",
        completed: 0,
        total: 1,
      });
      await waitForNextPaint();
      const candidate = await readCandidate();
      const storageError = await browserStorageError(candidate.totalBytes);
      if (storageError) throw new Error(storageError);
      const game = await importCandidate(candidate, setProgress);
      clearServiceWorkerGameCache(game.id);
      await refreshGames(game.id);
      setProgress(idleProgress);
    } catch (cause) {
      setProgress(idleProgress);
      setError(importErrorMessage(cause));
    }
  }

  async function selectGame(gameId: string | null) {
    if (gameId === null) {
      setActiveGameId(null);
      return;
    }

    const game = games.find((item) => item.id === gameId);
    if (!game) return;

    setError(null);
    setNotice(null);
    const sourceKind = game.sourceKind ?? "stored";
    if (sourceKind === "local-folder") {
      try {
        if (!(await requestLocalFolderPermission(game.id))) {
          setError("Folder access expired. Open the folder again.");
          return;
        }
      } catch {
        setError("Folder access expired. Open the folder again.");
        return;
      }
    }
    if (sourceKind === "session-folder" && !hasSessionFolder(game.id)) {
      setError("Folder session expired.");
      return;
    }

    setActiveGameId(gameId);
  }

  async function removeGame(game: GameRecord) {
    setError(null);
    setNotice(null);
    if (game.favorite) {
      setNotice("Remove this game from favorites before deleting it.");
      return;
    }

    try {
      if (activeGameId === game.id) {
        setActiveGameId(null);
        await waitForNextPaint();
      }
      await clearGameIndexedDbSaves(game);
      await deleteGame(game.id);
      clearGameStorageNamespace(game.id);
      clearSessionFolder(game.id);
      clearServiceWorkerGameCache(game.id);
      const remaining = games.filter((item) => item.id !== game.id);
      setGames(remaining);
      setGameEngines((engines) => {
        const next = { ...engines };
        delete next[game.id];
        return next;
      });
      setActiveGameId(remaining[0]?.id ?? null);
      setStorage(await estimateStorage());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Game removal failed.");
    }
  }

  async function clearStorage() {
    const gamesToRemove = games.filter((game) => !game.favorite);
    const favoriteGames = games.filter((game) => game.favorite);
    if (gamesToRemove.length === 0) {
      setError(null);
      setNotice(null);
      return;
    }

    const confirmed = window.confirm(
      favoriteGames.length > 0
        ? `Clear ${gamesToRemove.length} non-favorite ${
            gamesToRemove.length === 1 ? "game" : "games"
          }?`
        : "Clear all imported games, saves, and folder bindings stored by this player in this browser?",
    );
    if (!confirmed) return;

    const previousStorage = storage;
    setError(null);
    setNotice(null);
    try {
      const activeGameWillBeRemoved = gamesToRemove.some(
        (game) => game.id === activeGameId,
      );
      if (activeGameWillBeRemoved) {
        setActiveGameId(null);
        await waitForNextPaint();
      }

      if (favoriteGames.length === 0) {
        await clearServiceWorkerPlayerCache();
        await clearAllGameIndexedDbSaves();
        await clearPlayerStorage();
        clearAllGameStorageNamespaces();
        clearAllSessionFolders();
      } else {
        for (const game of gamesToRemove) {
          await clearGameIndexedDbSaves(game);
          await deleteGame(game.id);
          clearGameStorageNamespace(game.id);
          clearSessionFolder(game.id);
          clearServiceWorkerGameCache(game.id);
        }
      }

      setGames(favoriteGames);
      setGameEngines((engines) =>
        Object.fromEntries(
          favoriteGames.flatMap((game) =>
            engines[game.id] ? [[game.id, engines[game.id]]] : [],
          ),
        ),
      );
      if (activeGameWillBeRemoved) {
        setActiveGameId(favoriteGames[0]?.id ?? null);
      }
      setStorage(await estimateStorageAfterMutation(previousStorage));
      setNotice(
        favoriteGames.length > 0
          ? `Cleared ${gamesToRemove.length} ${
              gamesToRemove.length === 1 ? "game" : "games"
            }.`
          : "Storage cleared.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Storage clear failed.",
      );
    }
  }

  async function bindSessionFolder(game: GameRecord) {
    if (game.sourceKind !== "session-folder") {
      setError("Only session folders need to be bound again.");
      return;
    }

    setError(null);
    setNotice(null);
    onImportStart?.();
    try {
      const { files, folderName } = await chooseWebkitFolder();
      if (files.length === 0) {
        return;
      }

      setProgress({
        phase: "reading",
        label: "Binding folder",
        completed: 0,
        total: 1,
      });
      await waitForNextPaint();
      const candidate = await candidateFromFolder(files, folderName);
      if (
        candidate.title !== game.title &&
        !isPlaceholderGameTitle(game.title)
      ) {
        throw new Error(`Game mismatch.`);
      }
      const updated = await bindSessionFolderCandidate(
        game,
        candidate,
        setProgress,
      );
      registerSessionFolder(updated.id, candidate.files);
      clearServiceWorkerGameCache(updated.id);
      await refreshGames(updated.id);
      setNotice(`${updated.title} is bound.`);
      setProgress(idleProgress);
    } catch (cause) {
      setProgress(idleProgress);
      setError(cause instanceof Error ? cause.message : "Folder bind failed.");
    }
  }

  async function downloadSaves(game: GameRecord) {
    setError(null);
    try {
      await downloadSaveZip(game);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Save download failed.",
      );
    }
  }

  async function importSaves(
    game: GameRecord,
    files: File[],
    runtimeFrame?: HTMLIFrameElement,
  ) {
    setError(null);
    setNotice(null);
    try {
      const engine = gameEngines[game.id] ?? (await detectGameEngine(game.id));
      if (!supportsSaveImport(engine)) {
        setError(saveImportUnavailableReason(engine));
        return;
      }
      setGameEngines((engines) => ({ ...engines, [game.id]: engine }));
      const isFolder =
        files.length > 1 ||
        files.some((file) =>
          Boolean(
            (file as File & { webkitRelativePath?: string }).webkitRelativePath,
          ),
        );
      const importOptions = {
        beforeCommit: async () => {
          if (activeGameId !== game.id) return;
          setActiveGameId(null);
          await waitForNextPaint();
        },
        confirmOverwrite: (collisionCount: number) =>
          window.confirm(
            `${collisionCount} existing save ${
              collisionCount === 1 ? "entry" : "entries"
            } for ${game.title} will be overwritten. Continue?`,
          ),
        runtimeFrame,
      };
      const result = isFolder
        ? await importSaveFolder(game, files, importOptions)
        : await importSaveFile(game, files[0], importOptions);
      if (result.cancelled) {
        setNotice("Save import cancelled.");
        return;
      }
      clearServiceWorkerGameCache(game.id);
      setStorage(await estimateStorage());
      const label = result.importedEntries === 1 ? "save file" : "save files";
      setNotice(
        `Imported ${result.importedEntries} ${label} into ${game.title}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save import failed.");
    }
  }

  async function saveGameSettings(
    game: GameRecord,
    patch: Partial<GameRecord["settings"]>,
  ): Promise<GameRecord> {
    const updated: GameRecord = {
      ...game,
      settings: normalizePlayerSettings({ ...game.settings, ...patch }),
      updatedAt: new Date().toISOString(),
    };
    setGames((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
    await updateGameSettings(updated);
    clearServiceWorkerGameCache(updated.id);
    return updated;
  }

  async function toggleFavorite(game: GameRecord): Promise<void> {
    setError(null);
    setNotice(null);
    const updated: GameRecord = {
      ...game,
      favorite: !game.favorite,
    };

    try {
      await putGame(updated);
      setGames((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update favorite status.",
      );
    }
  }

  async function updateGameTitle(gameId: string, title: string): Promise<void> {
    const normalizedTitle = title.replace(/\s+/gu, " ").trim();
    const game = games.find((item) => item.id === gameId);
    if (
      !game ||
      !normalizedTitle ||
      isPlaceholderGameTitle(normalizedTitle) ||
      game.title === normalizedTitle
    ) {
      return;
    }

    const updated: GameRecord = {
      ...game,
      title: normalizedTitle,
      updatedAt: new Date().toISOString(),
    };
    setGames((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
    await putGame(updated);
  }

  return {
    activeGame,
    activeGameId,
    boundSessionGameIds,
    error,
    gameEngines,
    games,
    notice,
    canUseLocalFolderAccess: supportsLocalFolderAccess(),
    importFolder,
    importZip,
    openLocalFolder,
    progress,
    downloadSaves,
    importSaves,
    removeGame,
    clearStorage,
    bindSessionFolder,
    saveGameSettings,
    toggleFavorite,
    updateGameTitle,
    setActiveGameId: selectGame,
    setError,
    setNotice,
    storage,
  };
}
