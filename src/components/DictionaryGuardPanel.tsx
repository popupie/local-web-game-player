import type { KeyboardEvent } from "react";
import type {
  DictionaryDismissGuard,
  GameRecord,
  KeyChord,
} from "@/src/lib/types";
import { chordLabel, sameChord } from "@/src/lib/keyChords";
import { Icon } from "@/src/components/Icon";

interface DictionaryGuardPanelProps {
  activeGame?: GameRecord;
  canEditGame: boolean;
  defaultTriggers: KeyChord[];
  guard: DictionaryDismissGuard;
  onRecordTrigger: (event: KeyboardEvent) => void;
  onRemoveDefaultTrigger: (index: number) => void;
  onRemoveGameTrigger: (game: GameRecord, index: number) => void;
  onRestoreDefaultTrigger: (index: number) => void;
  onToggle: (game: GameRecord, guard: DictionaryDismissGuard) => void;
  recording: boolean;
  setRecording: (recording: boolean) => void;
}

interface AddGuardKeyButtonProps {
  disabled: boolean;
  label: string;
  onRecordTrigger: (event: KeyboardEvent) => void;
  recording: boolean;
  setRecording: (recording: boolean) => void;
}

function AddGuardKeyButton({
  disabled,
  label,
  onRecordTrigger,
  recording,
  setRecording,
}: AddGuardKeyButtonProps) {
  return (
    <button
      type="button"
      className={recording ? "guard-add-button recording" : "guard-add-button"}
      aria-label={label}
      aria-pressed={recording}
      disabled={disabled}
      onClick={(event) => {
        setRecording(!recording);
        event.currentTarget.focus();
      }}
      onKeyDown={onRecordTrigger}
    >
      <Icon name="plus" />
    </button>
  );
}

export function DictionaryGuardPanel({
  activeGame,
  canEditGame,
  defaultTriggers,
  guard,
  onRecordTrigger,
  onRemoveDefaultTrigger,
  onRemoveGameTrigger,
  onRestoreDefaultTrigger,
  onToggle,
  recording,
  setRecording,
}: DictionaryGuardPanelProps) {
  const gameOpen = Boolean(activeGame);
  const editingEnabled = !gameOpen || (canEditGame && guard.enabled);

  return (
    <section
      className="guard-popover"
      aria-label={gameOpen ? "Guard settings" : "Default guard key settings"}
    >
      <div className="guard-row">
        <span>Guard keys</span>
        {activeGame ? (
          <button
            type="button"
            aria-label="Guard"
            title="Guard"
            aria-pressed={guard.enabled}
            disabled={!canEditGame}
            onClick={() => {
              if (guard.enabled) setRecording(false);
              onToggle(activeGame, { ...guard, enabled: !guard.enabled });
            }}
          >
            {guard.enabled ? "On" : "Off"}
          </button>
        ) : (
          <span className="guard-status-default">Default</span>
        )}
      </div>

      <div className={editingEnabled ? "guard-chips" : "guard-chips disabled"}>
        {defaultTriggers.map((trigger, index) => {
          const label = chordLabel(trigger);
          const excluded = guard.excludedDefaultTriggers.some((item) =>
            sameChord(item, trigger),
          );
          return (
            <button
              className={`guard-chip removable default-key${excluded ? " excluded" : ""}`}
              key={`default:${label}:${index}`}
              type="button"
              disabled={!editingEnabled}
              aria-label={
                excluded
                  ? `Use default key ${label} for this game`
                  : gameOpen
                    ? `Ignore default key ${label} for this game`
                    : `Remove default key ${label}`
              }
              title={
                excluded
                  ? "Use this default key for this game"
                  : gameOpen
                    ? "Ignore this default key for this game"
                    : "Remove default key"
              }
              onClick={() =>
                excluded
                  ? onRestoreDefaultTrigger(index)
                  : onRemoveDefaultTrigger(index)
              }
            >
              <span>{label}</span>
              <Icon name={excluded ? "plus" : "x"} />
            </button>
          );
        })}

        {activeGame &&
          guard.triggers.map((trigger, index) => {
            const label = chordLabel(trigger);
            return (
              <button
                className="guard-chip removable game-key"
                key={`game:${label}:${index}`}
                type="button"
                disabled={!editingEnabled}
                aria-label={`Remove game-specific key ${label}`}
                title="Remove game-specific key"
                onClick={() => onRemoveGameTrigger(activeGame, index)}
              >
                <span>{label}</span>
                <Icon name="x" />
              </button>
            );
          })}

        <AddGuardKeyButton
          disabled={!editingEnabled}
          label={gameOpen ? "Add game-specific guard key" : "Add default guard key"}
          onRecordTrigger={onRecordTrigger}
          recording={recording}
          setRecording={setRecording}
        />
      </div>
    </section>
  );
}
