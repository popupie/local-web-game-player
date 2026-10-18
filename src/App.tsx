import { useRef } from "react";
import { LibraryPanel } from "@/src/components/LibraryPanel";
import { PlayerPanel } from "@/src/components/PlayerPanel";
import { usePlayerController } from "@/src/hooks/usePlayerController";
import { overlayTogglePatch, showTogglePatch } from "@/src/lib/playerSettings";

export default function App() {
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const controller = usePlayerController();
  const { library, player } = controller;

  return (
    <main className="app-shell" onKeyDown={controller.onAppKeyDown}>
      <LibraryPanel
        activeGame={library.activeGame}
        activeGuard={controller.activeDictionaryGuard}
        defaultGuardTriggers={controller.defaultGuardTriggers}
        boundSessionGameIds={library.boundSessionGameIds}
        directoryInputRef={directoryInputRef}
        error={library.error}
        gameEngines={library.gameEngines}
        games={library.games}
        guardAvailable={controller.overlayAvailable}
        notice={library.notice}
        clearStorage={() => void library.clearStorage()}
        downloadSaves={(game) => void library.downloadSaves(game)}
        importSaves={(game, files) =>
          void library.importSaves(
            game,
            files,
            library.activeGame?.id === game.id
              ? player.frameRef.current ?? undefined
              : undefined,
          )
        }
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
        quotaPercent={controller.quotaPercent}
        recordingGuardTrigger={controller.recordingGuardTrigger}
        removeGame={(game) => void library.removeGame(game)}
        bindSessionFolder={(game) => void library.bindSessionFolder(game)}
        removeDefaultGuardTrigger={(index) =>
          void controller.removeDefaultGuardTrigger(index)
        }
        removeGameGuardTrigger={(game, index) =>
          void controller.removeGameGuardTrigger(game, index)
        }
        recordGuardTrigger={(event) =>
          void controller.recordGuardTrigger(event)
        }
        restoreDefaultGuardTrigger={(index) =>
          void controller.restoreDefaultGuardTrigger(index)
        }
        resetError={() => library.setError(null)}
        resetNotice={() => library.setNotice(null)}
        setActiveGameId={(gameId) => void controller.selectGame(gameId)}
        setIdle={() => void controller.returnHome()}
        setDictionaryGuard={(game, guard) =>
          void controller.setDictionaryGuard(game, guard)
        }
        setRecordingGuardTrigger={controller.setRecordingGuardTrigger}
        toggleFavorite={(game) => void library.toggleFavorite(game)}
        storage={library.storage}
        zipInputRef={zipInputRef}
      />

      <PlayerPanel
        activeGame={library.activeGame}
        focusPlayer={() => void player.focusPlayer()}
        frameRef={player.frameRef}
        frameWrapRef={player.frameWrapRef}
        gameAspectRatio={player.gameAspectRatio}
        logsOpen={controller.logsOpen}
        overlayAvailable={controller.overlayAvailable}
        onIframeLoad={controller.handleIframeLoad}
        onRequestFullscreen={() =>
          void controller.handleReservedAction("fullscreen")
        }
        onToggleOverlay={(game) =>
          void controller.setGameSettingsAndFocus(game, overlayTogglePatch(game))
        }
        onToggleShow={(game) =>
          void controller.setGameSettingsAndFocus(game, showTogglePatch(game))
        }
        resetRuntimeError={controller.resetRuntimeError}
        runtimeError={controller.runtimeError}
        setLogsOpen={controller.setLogsOpen}
        textLogLimit={controller.textLogLimit}
        textLogs={controller.textLogs}
      />
    </main>
  );
}
