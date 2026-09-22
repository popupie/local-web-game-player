import type { CSSProperties, RefObject } from "react";
import { playUrl } from "../lib/playerUrls";
import type { GameRecord } from "../lib/types";
import { Icon } from "./Icon";
import { TextLogPanel } from "./TextLogPanel";

const githubUrl = "https://github.com/popupie/mv-mz-browser-player";

interface PlayerPanelProps {
  activeGame?: GameRecord;
  focusPlayer: () => void;
  frameRef: RefObject<HTMLIFrameElement | null>;
  frameWrapRef: RefObject<HTMLDivElement | null>;
  gameAspectRatio: number;
  logsOpen: boolean;
  onIframeLoad: () => void;
  onRequestFullscreen: () => void;
  onToggleOverlay: (game: GameRecord) => void;
  onToggleShow: (game: GameRecord) => void;
  resetRuntimeError: () => void;
  runtimeError: string | null;
  setLogsOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  textLogLimit: number;
  textLogs: string[];
}

export function PlayerPanel({
  activeGame,
  focusPlayer,
  frameRef,
  frameWrapRef,
  gameAspectRatio,
  logsOpen,
  onIframeLoad,
  onRequestFullscreen,
  onToggleOverlay,
  onToggleShow,
  resetRuntimeError,
  runtimeError,
  setLogsOpen,
  textLogLimit,
  textLogs,
}: PlayerPanelProps) {
  return (
    <section className={`player-panel${activeGame ? "" : " home-player-panel"}`} aria-label="Player">
      {!activeGame && (
        <div className="home-guide">
          <section className="home-guide-intro" aria-labelledby="home-title">
            <h2 id="home-title">How to use this player</h2>
            <p>
              Open a local RPG Maker MV/MZ, TyranoScript, or extracted
              Construct 2/NW.js export, then select it from the library. The
              folder or ZIP needs a game <code>index.html</code>.
            </p>
            <p>
              If the game files are packed inside an archive or executable,
              see the extraction instructions in the{" "}
              <a
                href={`${githubUrl}#extracting-packaged-desktop-games`}
                target="_blank"
                rel="noreferrer"
              >
                GitHub README
              </a>
              .
            </p>
          </section>

          <div className="home-action-grid" aria-label="Import choices">
            <article className="home-instruction-card">
              <span className="home-control-preview" aria-hidden="true">
                <Icon name="folder" />
              </span>
              <div>
                <h3>Open folder</h3>
                <p>
                  Uses files from your disk. Folder size does not count toward
                  browser storage.
                </p>
              </div>
            </article>

            <article className="home-instruction-card">
              <span className="home-control-preview" aria-hidden="true">
                <Icon name="archive" />
              </span>
              <div>
                <h3>Import ZIP</h3>
                <p>
                  Copies the game into browser storage. Better for smaller
                  games.
                </p>
              </div>
            </article>
          </div>

          <div className="home-secondary-grid">
            <section className="home-guide-section home-controls-section" aria-label="Button guide">
              <div className="home-controls-grid">
                <h3>Library buttons</h3>
                <h3>Player buttons</h3>

                <div className="home-control-cell">
                  <Icon name="download" />
                  <span>Download saves when you want a backup outside the browser.</span>
                </div>
                <div className="home-control-cell">
                  <Icon name="layers" />
                  <span>Overlay captures RPG Maker canvas text, TyranoScript HTML dialogue, and Construct 2 text or sprite-font dialogue for selection and the text log.</span>
                </div>

                <div className="home-control-cell">
                  <Icon name="trash" />
                  <span>Delete removes that library entry and its browser-stored data.</span>
                </div>
                <div className="home-control-cell">
                  <Icon name="eye" />
                  <span>Show makes overlay text visible on top of the game.</span>
                </div>

                <div className="home-control-cell">
                  <Icon name="home" />
                  <span>Home returns to this page.</span>
                </div>
                <div className="home-control-cell">
                  <Icon name="focus" />
                  <span>Focus sends keyboard input back to the game.</span>
                </div>

                <div className="home-control-cell">
                  <Icon name="shield" />
                  <span>Guard blocks added keys from reaching the game while the overlay is active.</span>
                </div>
                <div className="home-control-cell">
                  <Icon name="fullscreen" />
                  <span>Fullscreen expands the play view.</span>
                </div>
              </div>
            </section>
          </div>

          <section className="home-guide-section home-guide-note" aria-label="Folder warning and privacy">
            <p>
              When opening a folder, the browser may warn that all files from
              that folder will be uploaded. That is the normal folder picker
              warning. This app reads the files locally, and nothing is uploaded
              or stored on a server. Source is on{" "}
              <a href={githubUrl} target="_blank" rel="noreferrer">
                GitHub
              </a>
              .
            </p>
          </section>
        </div>
      )}

      {activeGame && (
        <>
          <div className="player-toolbar">
            <div>
              <h2>{activeGame.title}</h2>
              <p>{activeGame.entryPath}</p>
            </div>
            <div className="tool-buttons">
              <button type="button" aria-label="Open text overlay" title="Open text overlay" aria-pressed={activeGame.settings.overlayEnabled} onClick={() => onToggleOverlay(activeGame)}>
                <Icon name="layers" />
              </button>
              {activeGame.settings.overlayEnabled && (
                <button
                  type="button"
                  className="show-mode-button"
                  aria-label="Show overlay text"
                  title="Show overlay text"
                  aria-pressed={Boolean(activeGame.settings.readableOverlay)}
                  onClick={() => onToggleShow(activeGame)}
                >
                  <Icon name="eye" />
                </button>
              )}
              <button type="button" aria-label="Focus game" title="Focus game" onClick={focusPlayer}>
                <Icon name="focus" />
              </button>
              <button type="button" aria-label="Fullscreen" title="Fullscreen" onClick={onRequestFullscreen}>
                <Icon name="fullscreen" />
              </button>
            </div>
          </div>
          <div className="player-scroll">
            {runtimeError && (
              <div className="runtime-error dismissible-alert">
                <span>{runtimeError}</span>
                <button type="button" aria-label="Dismiss error" title="Dismiss error" onClick={resetRuntimeError}>
                  <Icon name="x" />
                </button>
              </div>
            )}
            <div ref={frameWrapRef} className="frame-wrap" style={{ "--game-aspect-ratio": String(gameAspectRatio) } as CSSProperties}>
              <iframe
                key={`${activeGame.id}:${activeGame.entryPath}`}
                ref={frameRef}
                title={activeGame.title}
                src={playUrl(activeGame)}
                allow="fullscreen; autoplay"
                tabIndex={-1}
                onLoad={onIframeLoad}
              />
            </div>
            <TextLogPanel logsOpen={logsOpen} setLogsOpen={setLogsOpen} textLogLimit={textLogLimit} textLogs={textLogs} />
          </div>
        </>
      )}
    </section>
  );
}
