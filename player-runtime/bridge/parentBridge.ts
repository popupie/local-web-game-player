// @ts-nocheck

import { keyEventMatchesChord } from "./keyEvents";

export function postParent(message) {
  try {
    window.parent.postMessage(message, window.location.origin);
  } catch {
    window.parent.postMessage(message, "*");
  }
}

export function createParentBridge({ gameId, overlay, postParentMessage, settings, viewport }) {
  function installReservedKeys() {
    window.addEventListener("keydown", handleReservedKeyEvent, true);
  }

  function handleReservedKeyEvent(event) {
    const match = reservedKeyForEvent(event);
    if (!match) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (!applyReservedKeyAction(match.action)) return;

    overlay.refreshOverlayClasses();
    postParentMessage({ type: "reserved-key", action: match.action, code: event.code });
    postStatus();
  }

  function reservedKeyForEvent(event) {
    return (settings.reservedKeys || []).find((key) => keyEventMatchesChord(event, key));
  }

  function applyReservedKeyAction(action) {
    if (action === "toggleOverlay") {
      settings.replace(settings.overlayEnabled
        ? { ...settings.current, overlayEnabled: false, readableOverlay: false, readerMode: false }
        : { ...settings.current, overlayEnabled: true, readableOverlay: false, readerMode: true });
      return true;
    }
    if (action === "toggleReader") {
      if (!settings.overlayEnabled) return false;
      settings.patch({ readableOverlay: !settings.readableOverlay, readerMode: true });
      return true;
    }
    return true;
  }

  function installMessageBridge() {
    window.addEventListener("message", handleParentMessage);
  }

  function handleParentMessage(event) {
    const message = event.data;
    if (!message || typeof message !== "object") return;

    if (message.type === "focus-game") {
      overlay.refreshOverlayClasses();
      overlay.focusGameTarget();
      return;
    }
    if (message.type === "player-viewport") {
      viewport.updatePlayerViewport(message);
      return;
    }

    applyParentSettingsMessage(message);
    overlay.refreshOverlayClasses();
    postStatus();
  }

  function applyParentSettingsMessage(message) {
    if (message.type === "player-settings") {
      settings.replace(message.settings);
      if (!overlay.dictionaryGuardActive()) overlay.clearGuardState();
    }
    if (message.type === "overlay-visible") {
      settings.patch({ overlayEnabled: Boolean(message.enabled) });
    }
    if (message.type === "reader-mode") {
      settings.patch({ overlayEnabled: message.enabled ? true : settings.overlayEnabled });
    }
  }

  function installErrorBridge() {
    window.addEventListener("error", (event) => {
      postParentMessage({ type: "runtime-error", message: String(event.message || "Runtime error"), stack: event.error && event.error.stack });
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason || {};
      postParentMessage({ type: "runtime-error", message: String(reason.message || reason || "Unhandled rejection"), stack: reason.stack });
    });
  }

  function postStatus() {
    postParentMessage({ type: "overlay-availability", gameId, available: true });
    postParentMessage({ type: "overlay-status", overlayEnabled: settings.overlayEnabled, readerMode: settings.readerMode });
  }

  return {
    installErrorBridge,
    installMessageBridge,
    installReservedKeys,
    postStatus,
  };
}
