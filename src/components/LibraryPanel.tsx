import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { formatBytes } from "../lib/format";
import type {
  DictionaryDismissGuard,
  GameRecord,
  ImportProgress,
} from "../lib/types";
import { DictionaryGuardPanel } from "./DictionaryGuardPanel";
import { GameCard } from "./GameCard";
import { Icon } from "./Icon";
import { ImportProgressCard } from "./ImportProgressCard";

interface LibraryPanelProps {
  activeGame?: GameRecord;
  activeGuard: DictionaryDismissGuard;
  boundSessionGameIds: Set<string>;
  directoryInputRef: RefObject<HTMLInputElement | null>;
  error: string | null;
  games: GameRecord[];
  guardAvailable: boolean;
  notice: string | null;
  clearStorage: () => void;
  downloadSaves: (game: GameRecord) => void;
  openFolder: () => void;
  importFolder: (event: ChangeEvent<HTMLInputElement>) => void;
  importZip: (event: ChangeEvent<HTMLInputElement>) => void;
  progress: ImportProgress;
  quotaPercent: number;
  recordingGuardTrigger: boolean;
  removeGame: (game: GameRecord) => void;
  bindSessionFolder: (game: GameRecord) => void;
  removeGuardTrigger: (game: GameRecord, index: number) => void;
  recordGuardTrigger: (game: GameRecord, event: KeyboardEvent) => void;
  resetError: () => void;
  resetNotice: () => void;
  setActiveGameId: (gameId: string) => void;
  setIdle: () => void;
  setDictionaryGuard: (game: GameRecord, guard: DictionaryDismissGuard) => void;
  setRecordingGuardTrigger: (recording: boolean) => void;
  storage?: StorageEstimate;
  zipInputRef: RefObject<HTMLInputElement | null>;
}

export function LibraryPanel({
  activeGame,
  activeGuard,
  boundSessionGameIds,
  directoryInputRef,
  error,
  games,
  guardAvailable,
  notice,
  clearStorage,
  downloadSaves,
  openFolder,
  importFolder,
  importZip,
  progress,
  quotaPercent,
  recordingGuardTrigger,
  removeGame,
  bindSessionFolder,
  removeGuardTrigger,
  recordGuardTrigger,
  resetError,
  resetNotice,
  setActiveGameId,
  setIdle,
  setDictionaryGuard,
  setRecordingGuardTrigger,
  storage,
  zipInputRef,
}: LibraryPanelProps) {
  const storageUsage = storage?.usage ?? 0;
  const storageQuota = storage?.quota ?? 0;
  const storageText = storageQuota
    ? `${formatBytes(storageUsage)} / ${formatBytes(storageQuota)}`
    : formatBytes(storageUsage);

  return (
    <section className="library-panel" aria-label="Game library">
      <div className="sidebar-top">
        <div className="brand-row">
          <div>
            <h1>Local Web Game Player</h1>
          </div>
          <div className="brand-actions">
            <button
              type="button"
              className="icon-button nav-button"
              aria-label="Home"
              title="Home"
              onClick={setIdle}
            >
              <Icon name="home" />
            </button>
          </div>
        </div>

        <div className="import-actions">
          <button
            type="button"
            aria-label="Open folder without using browser storage"
            title="Open folder without using browser storage"
            onClick={openFolder}
          >
            <Icon name="folder" />
          </button>
          <button
            type="button"
            aria-label="Import ZIP"
            title="Import ZIP"
            onClick={() => zipInputRef.current?.click()}
          >
            <Icon name="archive" />
          </button>
          <input
            ref={directoryInputRef}
            className="hidden-input"
            type="file"
            multiple
            onChange={importFolder}
            {...{ webkitdirectory: "" }}
          />
          <input
            ref={zipInputRef}
            className="hidden-input"
            type="file"
            accept=".zip,application/zip"
            onChange={importZip}
          />
        </div>
      </div>

      <div className="game-list">
        {progress.phase !== "idle" && (
          <ImportProgressCard progress={progress} />
        )}

        {error && (
          <div className="alert dismissible-alert">
            <span>{error}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              title="Dismiss error"
              onClick={resetError}
            >
              <Icon name="x" />
            </button>
          </div>
        )}

        {notice && (
          <div className="notice dismissible-alert">
            <span>{notice}</span>
            <button
              type="button"
              aria-label="Dismiss notice"
              title="Dismiss notice"
              onClick={resetNotice}
            >
              <Icon name="x" />
            </button>
          </div>
        )}

        {games.map((game) => (
          <GameCard
            key={game.id}
            active={game.id === activeGame?.id}
            boundSession={boundSessionGameIds.has(game.id)}
            game={game}
            onDelete={removeGame}
            onDownloadSaves={downloadSaves}
            onBindSessionFolder={bindSessionFolder}
            onSelect={setActiveGameId}
          />
        ))}
      </div>

      <div className="sidebar-bottom">
        <DictionaryGuardPanel
          activeGame={guardAvailable ? activeGame : undefined}
          guard={activeGuard}
          onRecordTrigger={recordGuardTrigger}
          onRemoveTrigger={removeGuardTrigger}
          onToggle={setDictionaryGuard}
          recording={recordingGuardTrigger}
          setRecording={setRecordingGuardTrigger}
        />

        <div className="storage-meter">
          <div className="storage-meter-header">
            <span>Browser storage</span>
            <div className="storage-meter-actions">
              <span>{storageText}</span>
              <button
                type="button"
                className="icon-button storage-clear-button"
                aria-label="Clear storage"
                title="Clear storage"
                onClick={clearStorage}
              >
                <Icon name="trash" />
              </button>
            </div>
          </div>
          <progress value={quotaPercent} max={100} />
        </div>
      </div>
    </section>
  );
}
