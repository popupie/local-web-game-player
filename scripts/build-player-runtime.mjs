import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(root, "public/mz-player-runtime");
const require = createRequire(import.meta.url);
const browserNodeAliases = {
  events: require.resolve("events/"),
  stream: require.resolve("stream-browserify"),
};

const nodeBrowserAliasPlugin = {
  name: "node-browser-alias",
  setup(build) {
    for (const [moduleName, path] of Object.entries(browserNodeAliases)) {
      build.onResolve({ filter: new RegExp("^" + moduleName + "$") }, () => ({
        path,
      }));
    }
  },
};

async function buildRuntime(entryName) {
  await build({
    banner: {
      js: [
        "var process = globalThis.process || (globalThis.process = {",
        "  browser: true,",
        "  env: {},",
        "  nextTick: function(callback) {",
        "    var args = Array.prototype.slice.call(arguments, 1);",
        "    Promise.resolve().then(function() { callback.apply(null, args); });",
        "  },",
        "});",
      ].join("\n"),
    },
    bundle: true,
    define: {
      global: "globalThis",
    },
    entryPoints: [resolve(root, "player-runtime", entryName + ".ts")],
    format: "iife",
    inject: [resolve(root, "player-runtime/node-globals.ts")],
    logLevel: "info",
    minify: true,
    outfile: resolve(outdir, entryName + ".js"),
    platform: "browser",
    plugins: [nodeBrowserAliasPlugin],
    target: ["es2020"],
  });
}

async function buildRuntimeBridge() {
  await build({
    banner: {
      js: "/* Generated from player-runtime/bridge/*.ts by scripts/build-player-runtime.mjs. */",
    },
    bundle: true,
    entryPoints: [resolve(root, "player-runtime/bridge/index.ts")],
    format: "iife",
    logLevel: "info",
    minify: false,
    outfile: resolve(root, "public/runtime-bridge.js"),
    platform: "browser",
    target: ["es2020"],
  });
}

await mkdir(outdir, { recursive: true });
await buildRuntime("buffer");
await buildRuntime("desktop");
await buildRuntime("wolf");
await buildRuntimeBridge();
