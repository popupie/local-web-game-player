// @ts-nocheck

import { createParentBridge, postParent } from "@/player-runtime/bridge/parentBridge";
import { createSettingsStore } from "@/player-runtime/bridge/settings";
import { patchLocalStorage } from "@/player-runtime/bridge/storageNamespace";
import { createTextOverlayBridge } from "@/player-runtime/bridge/overlay";
import { createViewportBridge } from "@/player-runtime/bridge/viewport";
import { installRpgMakerEncryptionFallback } from "@/player-runtime/engines/rpgmaker_mvmz/encryption";
import { trackIndexedDbDatabases } from "@/shared/indexedDbSaveTracking";

(() => {
  const config = window.__MZ_PLAYER_BRIDGE__;
  if (!config || !config.gameId || window.__mzPlayerBridgeInstalled) return;
  window.__mzPlayerBridgeInstalled = true;

  const settings = createSettingsStore(config.settings);
  const postParentMessage = postParent;
  const prefix = `mz-player:${config.gameId}:`;

  trackIndexedDbDatabases(prefix);
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
    gameId: config.gameId,
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
  overlay.installCocosOverlayHooks();
  overlay.installDictionaryGuardInputHooks();
  overlay.refreshOverlayClasses();
  parent.postStatus();
})();
