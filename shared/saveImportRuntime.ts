export type RuntimeSaveImportEngine = "construct-2" | "wolf";

export interface RuntimeSaveImportEntry {
  path: string;
  data: ArrayBuffer;
}

export type RuntimeSaveImportRequest =
  | {
      type: "save-import-probe";
      requestId: string;
      gameId: string;
      engine: RuntimeSaveImportEngine;
    }
  | {
      type: "save-import-prepare";
      requestId: string;
      gameId: string;
      engine: RuntimeSaveImportEngine;
      entries: RuntimeSaveImportEntry[];
    }
  | {
      type: "save-import-commit";
      requestId: string;
      gameId: string;
      engine: RuntimeSaveImportEngine;
    }
  | {
      type: "save-import-abort";
      requestId: string;
      gameId: string;
      engine: RuntimeSaveImportEngine;
    };

export type RuntimeSaveImportResponse =
  | {
      type: "save-import-ready";
      requestId: string;
      gameId: string;
      engine: RuntimeSaveImportEngine;
    }
  | {
      type: "save-import-prepared";
      requestId: string;
      gameId: string;
      engine: RuntimeSaveImportEngine;
      collisionCount: number;
      importedEntries: number;
    }
  | {
      type: "save-import-complete";
      requestId: string;
      gameId: string;
      engine: RuntimeSaveImportEngine;
      importedEntries: number;
    }
  | {
      type: "save-import-error";
      requestId: string;
      gameId: string;
      engine: RuntimeSaveImportEngine;
      message: string;
    };
