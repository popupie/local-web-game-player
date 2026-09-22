// @ts-nocheck

import { createParentBridge, postParent } from "./parentBridge";
import { createSettingsStore } from "./settings";
import { patchLocalStorage } from "./storageNamespace";
import { createTextOverlayBridge } from "./overlay";
import { createViewportBridge } from "./viewport";
import { installRpgMakerEncryptionFallback } from "./encryptionFallback";

(() => {
  const config = window.__MZ_PLAYER_BRIDGE__;
  if (!config || !config.gameId || window.__mzPlayerBridgeInstalled) return;
  window.__mzPlayerBridgeInstalled = true;

  const settings = createSettingsStore(config.settings);
  const postParentMessage = postParent;
  const prefix = `mz-player:${config.gameId}:`;

  patchLocalStorage(prefix);

  const overlay = createTextOverlayBridge({
    config,
    postParentMessage,
    settings,
  });
  const viewport = createViewportBridge({
    postParentMessage,
    scheduleFlush: overlay.scheduleFlush,
  });
  const parent = createParentBridge({
    overlay,
    postParentMessage,
    settings,
    viewport,
  });

  parent.installReservedKeys();
  parent.installMessageBridge();
  parent.installErrorBridge();
  viewport.installViewportBridge();
  installRpgMakerEncryptionFallback();
  overlay.ensureOverlayDom();
  overlay.installRpgMakerOverlayHooks();
  overlay.installTyranoOverlayHooks();
  overlay.installConstruct2OverlayHooks();
  overlay.installDictionaryGuardInputHooks();
  overlay.refreshOverlayClasses();
  parent.postStatus();
})();
