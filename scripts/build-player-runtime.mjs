import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(root, "public/mz-player-runtime");
const require = createRequire(import.meta.url);
const browserNodeAliases = {
  assert: resolve(root, "player-runtime/desktop/buildAliases/assert.ts"),
  events: require.resolve("events/"),
  fs: resolve(root, "player-runtime/desktop/buildAliases/fs.ts"),
  http: resolve(root, "player-runtime/desktop/buildAliases/network.ts"),
  https: resolve(root, "player-runtime/desktop/buildAliases/network.ts"),
  net: resolve(root, "player-runtime/desktop/buildAliases/network.ts"),
  path: resolve(root, "player-runtime/desktop/buildAliases/path.ts"),
  querystring: resolve(root, "player-runtime/desktop/buildAliases/querystring.ts"),
  stream: require.resolve("stream-browserify"),
  tls: resolve(root, "player-runtime/desktop/buildAliases/network.ts"),
  url: resolve(root, "player-runtime/desktop/buildAliases/url.ts"),
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

async function buildRuntime(entryName, entryPath = entryName) {
  await build({
    banner: {
      js: [
        "var process = globalThis.process || (globalThis.process = {",
        "  argv: ['/Game.exe'],",
        "  browser: true,",
        "  cwd: function() { return '/www'; },",
        "  env: {},",
        "  platform: 'browser',",
        "  version: 'v16.20.2',",
        "  versions: { node: '16.20.2', nw: '0.72.0' },",
        "  nextTick: function(callback) {",
        "    var args = Array.prototype.slice.call(arguments, 1);",
        "    Promise.resolve().then(function() { callback.apply(null, args); });",
        "  },",
        "});",
      ].join("\n"),
    },
    bundle: true,
    alias: {
      "@": root,
    },
    define: {
      global: "globalThis",
    },
    entryPoints: [resolve(root, "player-runtime", entryPath + ".ts")],
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
    alias: {
      "@": root,
    },
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
await buildRuntime("node-nlp");
await buildRuntime("desktop");
await buildRuntime("wolf", "engines/wolf/index");
await buildRuntimeBridge();
