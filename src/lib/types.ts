export type ReservedKeyAction = "toggleOverlay" | "toggleReader" | "focusPlayer" | "fullscreen";

export interface ReservedKey {
  code: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  action: ReservedKeyAction;
  label: string;
}

export interface KeyChord {
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  label: string;
}

export interface DictionaryDismissGuard {
  enabled: boolean;
  triggers: KeyChord[];
}

export interface PlayerSettings {
  reservedKeys: ReservedKey[];
  dictionaryDismissGuard: DictionaryDismissGuard;
  overlayEnabled: boolean;
  readableOverlay: boolean;
  readerMode: boolean;
}

export type GameSourceKind = "stored" | "local-folder" | "session-folder";

export interface GameRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  entryPath: string;
  fileCount: number;
  totalBytes: number;
  sourceKind?: GameSourceKind;
  settings: PlayerSettings;
}

export type StorageKind = "opfs" | "indexeddb" | "local-folder" | "session-file";

export interface StoredGameFile {
  gameId: string;
  path: string;
  size: number;
  mime: string;
  storageRef: string;
  storageKind: StorageKind;
}

export interface ImportProgress {
  phase: "idle" | "reading" | "storing" | "done" | "error";
  label: string;
  completed: number;
  total: number;
}

export type PlayerToParentMessage =
  | { type: "reserved-key"; action: ReservedKeyAction; code: string }
  | { type: "overlay-availability"; gameId: string; available: boolean }
  | { type: "overlay-status"; overlayEnabled: boolean; readerMode: boolean }
  | { type: "game-viewport"; width: number; height: number }
  | { type: "return-focus" }
  | { type: "text-log"; gameId: string; text: string; at: number }
  | { type: "runtime-error"; message: string; stack?: string }
  | { type: "wolf-assets-request"; gameId: string; requestId: string };

export type ParentToPlayerMessage =
  | { type: "player-settings"; settings: PlayerSettings }
  | { type: "overlay-visible"; enabled: boolean }
  | { type: "reader-mode"; enabled: boolean }
  | { type: "focus-game" }
  | { type: "player-viewport"; width: number; height: number; devicePixelRatio: number }
  | {
      type: "wolf-assets-response";
      requestId: string;
      assets?: Array<{ path: string; url: string; size: number }>;
      error?: string;
    };

export interface ImportCandidate {
  title: string;
  files: Array<{ path: string; file: Blob }>;
  entryPath: string;
  totalBytes: number;
}
