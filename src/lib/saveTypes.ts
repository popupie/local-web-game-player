import type { GameEngine } from "@/src/engines/types";

export type { GameEngine } from "@/src/engines/types";

export interface SaveExportEntry {
  path: string;
  data: string | Uint8Array;
  target?: SaveExportTarget;
}

export interface IndexedDbRecord {
  autoIncrement?: boolean;
  database: string;
  indexes?: Array<{
    name: string;
    keyPath: string | string[];
    multiEntry: boolean;
    unique: boolean;
  }>;
  store: string;
  key: IDBValidKey;
  keyPath?: string | string[] | null;
  value: unknown;
}

export interface StoreIndexSpec {
  name: string;
  keyPath: string | string[];
  multiEntry: boolean;
  unique: boolean;
}

export interface IndexedDbWrite {
  autoIncrement?: boolean;
  database: string;
  indexes?: StoreIndexSpec[];
  store: string;
  key: IDBValidKey;
  value: unknown;
  keyPath?: string | string[] | null;
  timestampIndex?: boolean;
}

export type SerializedIndexedDbKey =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "date"; value: string }
  | { type: "binary"; value: string }
  | { type: "array"; value: SerializedIndexedDbKey[] };

export type SaveExportTarget =
  | { kind: "local-storage"; key: string }
  | { kind: "vfs"; path: string }
  | {
      kind: "indexeddb";
      database: string;
      store: string;
      key: SerializedIndexedDbKey;
      autoIncrement?: boolean;
      indexes?: Array<{
        name: string;
        keyPath: string | string[];
        multiEntry: boolean;
        unique: boolean;
      }>;
      keyPath?: string | string[] | null;
      valueType?: string;
      mimeType?: string;
    };

export interface SaveArchiveManifest {
  format: "mz-browser-player-save-backup";
  version: 1;
  engine: GameEngine;
  entries: Array<{
    path: string;
    dataType: "text" | "binary";
    target?: SaveExportTarget;
  }>;
}
