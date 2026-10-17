import {
  type ChangeEvent,
  type FocusEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  saveImportUnavailableReason,
  supportsSaveImport,
} from "@/src/engines/capabilities";
import type { GameEngine } from "@/src/engines/types";
import { formatBytes } from "@/src/lib/format";
import type { GameRecord } from "@/src/lib/types";
import { Icon } from "@/src/components/Icon";

interface GameCardProps {
  active: boolean;
  boundSession: boolean;
  engine?: GameEngine;
  game: GameRecord;
  onDelete: (game: GameRecord) => void;
  onDownloadSaves: (game: GameRecord) => void;
  onImportSaves: (game: GameRecord, files: File[]) => void;
  onBindSessionFolder: (game: GameRecord) => void;
  onSelect: (gameId: string) => void;
}

function storageLabel(game: GameRecord, boundSession: boolean): string {
  if (game.sourceKind === "local-folder")
    return "linked folder, no browser storage";
  if (game.sourceKind === "session-folder")
    return boundSession ? "bound" : "not bound";
  return "stored";
}

function detailsLabel(game: GameRecord, boundSession: boolean): string {
  const label = storageLabel(game, boundSession);
  if (
    game.sourceKind === "local-folder" ||
    game.sourceKind === "session-folder"
  ) {
    return `${game.fileCount} files · ${label}`;
  }
  return `${game.fileCount} files · ${formatBytes(game.totalBytes)} · ${label}`;
}

export function GameCard({
  active,
  boundSession,
  engine,
  game,
  onBindSessionFolder,
  onDelete,
  onDownloadSaves,
  onImportSaves,
  onSelect,
}: GameCardProps) {
  const actionMenuId = useId();
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsToggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const saveFolderInputRef = useRef<HTMLInputElement>(null);
  const saveFileInputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [actionsOpen, setActionsOpen] = useState(false);
  const [importChoicesVisible, setImportChoicesVisible] = useState(false);
  const [importSubmenuLeft, setImportSubmenuLeft] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const canBindSession = game.sourceKind === "session-folder";
  const unboundSession = canBindSession && !boundSession;
  const canImportSaves = supportsSaveImport(engine);
  const importUnavailableReason = saveImportUnavailableReason(engine);
  const className = [
    "game-card",
    active ? "active" : "",
    unboundSession ? "unbound-session" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const handleMainClick = () => {
    if (unboundSession) {
      onBindSessionFolder(game);
      return;
    }
    onSelect(game.id);
  };
  const positionMenu = () => {
    const toggle = actionsToggleRef.current;
    if (!toggle) return;

    const rect = toggle.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const menuWidth = 148;
    const menuHeight = 102;
    const preferredLeft = rect.right + gap;
    const left =
      preferredLeft + menuWidth <= window.innerWidth - margin
        ? preferredLeft
        : Math.max(margin, rect.left - menuWidth - gap);
    const top = Math.min(
      Math.max(margin, rect.top + rect.height / 2 - menuHeight / 2),
      window.innerHeight - menuHeight - margin,
    );

    setMenuPosition({ left, top });
    setImportSubmenuLeft(
      left + menuWidth * 2 + gap > window.innerWidth - margin,
    );
  };
  const clearCloseTimer = () => {
    if (closeTimerRef.current === undefined) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = undefined;
  };
  const showActions = () => {
    clearCloseTimer();
    positionMenu();
    setActionsOpen(true);
  };
  const scheduleHideActions = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setActionsOpen(false), 100);
  };
  const handleActionsBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (
      nextTarget &&
      (actionsRef.current?.contains(nextTarget) ||
        menuRef.current?.contains(nextTarget))
    ) {
      return;
    }
    setActionsOpen(false);
  };
  const handleSaveFolder = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (canImportSaves && files.length > 0) onImportSaves(game, files);
  };
  const handleSaveFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (canImportSaves && file) onImportSaves(game, [file]);
  };

  useEffect(() => {
    if (!actionsOpen) return;

    positionMenu();
    const repositionMenu = () => positionMenu();
    window.addEventListener("resize", repositionMenu);
    window.addEventListener("scroll", repositionMenu, true);
    return () => {
      window.removeEventListener("resize", repositionMenu);
      window.removeEventListener("scroll", repositionMenu, true);
    };
  }, [actionsOpen]);

  useEffect(() => {
    if (!actionsOpen) setImportChoicesVisible(false);
  }, [actionsOpen]);

  useEffect(
    () => () => {
      clearCloseTimer();
    },
    [],
  );

  return (
    <article className={className}>
      <button type="button" className="game-main" onClick={handleMainClick}>
        <strong>{game.title}</strong>
        <span>{detailsLabel(game, boundSession)}</span>
      </button>

      <div
        ref={actionsRef}
        className="game-actions"
        onBlur={handleActionsBlur}
        onMouseEnter={showActions}
        onMouseLeave={scheduleHideActions}
      >
        <button
          ref={actionsToggleRef}
          type="button"
          className="icon-button game-actions-toggle"
          aria-label={`Options for ${game.title}`}
          aria-controls={actionMenuId}
          aria-expanded={actionsOpen}
          title="Game options"
          onClick={showActions}
          onFocus={showActions}
        >
          <Icon name="moreVertical" />
        </button>

        {actionsOpen &&
          createPortal(
            <div
              ref={menuRef}
              id={actionMenuId}
              className="game-actions-menu"
              aria-label={`Options for ${game.title}`}
              style={menuPosition}
              onBlur={handleActionsBlur}
              onMouseEnter={showActions}
              onMouseLeave={scheduleHideActions}
            >
              <button
                type="button"
                className="game-action-button"
                onClick={() => {
                  setActionsOpen(false);
                  onDownloadSaves(game);
                }}
              >
                <Icon name="download" />
                <span>Download saves</span>
              </button>

              <div
                className="game-import-action"
                onMouseEnter={() => {
                  if (canImportSaves) setImportChoicesVisible(true);
                }}
                onMouseLeave={() => setImportChoicesVisible(false)}
              >
                <button
                  type="button"
                  className="game-action-button has-submenu"
                  disabled={!canImportSaves}
                  title={canImportSaves ? "Import save" : importUnavailableReason}
                  aria-haspopup="menu"
                  aria-expanded={canImportSaves && importChoicesVisible}
                  onClick={() => setImportChoicesVisible(true)}
                  onFocus={() => setImportChoicesVisible(true)}
                >
                  <Icon name="upload" />
                  <span>Import save</span>
                </button>
                {canImportSaves && importChoicesVisible && (
                  <div
                    className={`game-import-submenu${
                      importSubmenuLeft ? " open-left" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="game-action-button"
                      onClick={() => {
                        setActionsOpen(false);
                        saveFileInputRef.current?.click();
                      }}
                    >
                      <Icon name="archive" />
                      <span>File or ZIP</span>
                    </button>
                    <button
                      type="button"
                      className="game-action-button"
                      onClick={() => {
                        setActionsOpen(false);
                        saveFolderInputRef.current?.click();
                      }}
                    >
                      <Icon name="folder" />
                      <span>Folder</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="game-action-button danger"
                onClick={() => {
                  setActionsOpen(false);
                  onDelete(game);
                }}
              >
                <Icon name="trash" />
                <span>Delete</span>
              </button>
            </div>,
            document.body,
          )}
      </div>

      <input
        ref={saveFolderInputRef}
        className="hidden-input"
        type="file"
        multiple
        disabled={!canImportSaves}
        aria-label={`Import save folder for ${game.title}`}
        onChange={handleSaveFolder}
        {...{ webkitdirectory: "" }}
      />
      <input
        ref={saveFileInputRef}
        className="hidden-input"
        type="file"
        disabled={!canImportSaves}
        aria-label={`Import a save file or ZIP for ${game.title}`}
        onChange={handleSaveFile}
      />
    </article>
  );
}
