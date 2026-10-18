import type { PlayerSettings } from "@/src/lib/types";
import { defaultDictionaryDismissGuard, defaultReservedKeys } from "@/src/lib/playerSettings";

export const defaultPlayerSettings = (): PlayerSettings => ({
  overlayEnabled: false,
  readableOverlay: false,
  readerMode: false,
  dictionaryDismissGuard: {
    ...defaultDictionaryDismissGuard,
    triggers: defaultDictionaryDismissGuard.triggers.map((trigger) => ({ ...trigger })),
    excludedDefaultTriggers:
      defaultDictionaryDismissGuard.excludedDefaultTriggers.map((trigger) => ({
        ...trigger,
      })),
  },
  reservedKeys: defaultReservedKeys.map((key) => ({ ...key })),
});
