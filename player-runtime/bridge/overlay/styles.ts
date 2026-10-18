export const OVERLAY_STYLES = `
  canvas:focus,
  canvas:focus-visible,
  video:focus,
  video:focus-visible {
    outline: none !important;
  }

  #mz-player-text-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
    display: none;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
  }

  #mz-player-text-overlay.mz-player-text-overlay-active {
    display: block;
  }

  .mz-player-text-overlay-entry {
    position: fixed;
    box-sizing: border-box;
    display: block;
    white-space: pre;
    overflow: visible;
    pointer-events: none;
    user-select: text;
    contain: layout style paint;
    color: transparent;
    text-shadow: none;
    background: transparent;
    border-radius: 2px;
    padding: 0;
    margin: 0;
    border: 0;
    line-height: 1;
    letter-spacing: 0;
    word-spacing: 0;
    font-kerning: none;
    font-variant-ligatures: none;
    opacity: 1;
  }

  .mz-player-text-overlay-entry-dom {
    white-space: pre-wrap;
    overflow-wrap: normal;
  }

  .mz-player-text-overlay-entry-construct2 {
    white-space: pre;
    overflow: visible;
  }

  .mz-player-text-overlay-entry-construct2-line {
    position: absolute;
    display: block;
    white-space: pre;
    transform-origin: 0 0;
    user-select: text;
  }

  .mz-player-text-overlay-entry-construct2-character {
    position: absolute;
    display: block;
    top: 0;
    white-space: pre;
    transform-origin: 0 0;
    font: inherit;
    color: inherit;
    text-shadow: inherit;
  }

  .mz-player-text-overlay-entry-cocos {
    white-space: pre-wrap;
    overflow: hidden;
  }

  .mz-player-text-overlay-entry-rpg-text {
    position: absolute;
    display: block;
    box-sizing: border-box;
    white-space: pre;
    overflow: visible;
    padding: 0;
    margin: 0;
    border: 0;
    color: inherit;
    text-shadow: inherit;
    user-select: text;
  }

  .mz-player-text-overlay-entry-rpg {
    contain: layout style;
  }

  #mz-player-text-overlay.mz-player-text-overlay-readable
    .mz-player-text-overlay-entry {
    color: rgba(255, 255, 255, 0.96);
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.95),
      0 0 3px rgba(0, 0, 0, 0.8);
    background: transparent;
  }

  #mz-player-text-overlay.mz-player-text-overlay-reader
    .mz-player-text-overlay-entry {
    pointer-events: auto;
    cursor: text;
  }
`;
