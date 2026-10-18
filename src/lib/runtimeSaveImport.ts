import type {
  RuntimeSaveImportEngine,
  RuntimeSaveImportEntry,
  RuntimeSaveImportRequest,
  RuntimeSaveImportResponse,
} from "@/shared/saveImportRuntime";
import { playUrl } from "@/src/lib/playerUrls";
import type { GameRecord } from "@/src/lib/types";

const RUNTIME_IMPORT_TIMEOUT_MS = 90_000;
const RUNTIME_PROBE_INTERVAL_MS = 250;

export interface RuntimeSaveEntry {
  path: string;
  bytes: Uint8Array;
}

export interface RuntimeSaveImportOptions {
  confirmOverwrite?: (collisionCount: number) => boolean | Promise<boolean>;
  frame: HTMLIFrameElement;
}

export interface RuntimeSaveImportResult {
  cancelled?: boolean;
  importedEntries: number;
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function createSaveImportFrame(game: GameRecord): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.src = playUrl(game);
  frame.hidden = true;
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  frame.title = `Import saves into ${game.title}`;
  return frame;
}

export function importSavesThroughRuntime(
  game: GameRecord,
  engine: RuntimeSaveImportEngine,
  entries: RuntimeSaveEntry[],
  options: RuntimeSaveImportOptions,
): Promise<RuntimeSaveImportResult> {
  const requestId = crypto.randomUUID();
  const frameWindow = options.frame.contentWindow;
  if (!frameWindow) {
    return Promise.reject(new Error("The game runtime is not available."));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let prepared = false;

    const finish = (
      result?: RuntimeSaveImportResult,
      error?: unknown,
    ): void => {
      if (settled) return;
      settled = true;
      window.clearInterval(probeInterval);
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (error !== undefined) {
        reject(error instanceof Error ? error : new Error(String(error)));
      } else if (result) {
        resolve(result);
      }
    };

    const post = (
      message: RuntimeSaveImportRequest,
      transfer: Transferable[] = [],
    ): void => {
      frameWindow.postMessage(message, window.location.origin, transfer);
    };

    const abort = (): void => {
      post({
        type: "save-import-abort",
        requestId,
        gameId: game.id,
        engine,
      });
    };

    const onMessage = (event: MessageEvent<RuntimeSaveImportResponse>): void => {
      const message = event.data;
      if (
        event.origin !== window.location.origin ||
        event.source !== frameWindow ||
        !message ||
        message.requestId !== requestId ||
        message.gameId !== game.id ||
        message.engine !== engine
      ) {
        return;
      }

      if (message.type === "save-import-error") {
        finish(undefined, new Error(message.message));
        return;
      }
      if (message.type === "save-import-ready" && !prepared) {
        prepared = true;
        window.clearInterval(probeInterval);
        const runtimeEntries: RuntimeSaveImportEntry[] = entries.map(
          (entry) => ({
            path: entry.path,
            data: arrayBufferFromBytes(entry.bytes),
          }),
        );
        post(
          {
            type: "save-import-prepare",
            requestId,
            gameId: game.id,
            engine,
            entries: runtimeEntries,
          },
          runtimeEntries.map((entry) => entry.data),
        );
        return;
      }
      if (message.type === "save-import-prepared") {
        void (async () => {
          try {
            if (
              message.collisionCount > 0 &&
              options.confirmOverwrite &&
              !(await options.confirmOverwrite(message.collisionCount))
            ) {
              abort();
              finish({ cancelled: true, importedEntries: 0 });
              return;
            }
            post({
              type: "save-import-commit",
              requestId,
              gameId: game.id,
              engine,
            });
          } catch (cause) {
            abort();
            finish(undefined, cause);
          }
        })();
        return;
      }
      if (message.type === "save-import-complete") {
        finish({ importedEntries: message.importedEntries });
      }
    };

    window.addEventListener("message", onMessage);
    const probe = (): void => {
      post({
        type: "save-import-probe",
        requestId,
        gameId: game.id,
        engine,
      });
    };
    const probeInterval = window.setInterval(
      probe,
      RUNTIME_PROBE_INTERVAL_MS,
    );
    const timeout = window.setTimeout(() => {
      abort();
      finish(
        undefined,
        new Error(`The ${engine === "wolf" ? "WOLF RPG" : "Construct 2"} runtime took too long to prepare save import.`),
      );
    }, RUNTIME_IMPORT_TIMEOUT_MS);
    probe();
  });
}
