// @ts-nocheck

function runtimeUrl() {
  return globalThis.MzPlayerDesktop?.require?.("url");
}

export const parse = (...args) => runtimeUrl().parse(...args);
export const format = (...args) => runtimeUrl().format(...args);
export const resolve = (...args) => runtimeUrl().resolve(...args);
export const fileURLToPath = (...args) => runtimeUrl().fileURLToPath(...args);
export const pathToFileURL = (...args) => runtimeUrl().pathToFileURL(...args);
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;

export default {
  URL,
  URLSearchParams,
  fileURLToPath,
  format,
  parse,
  pathToFileURL,
  resolve,
};
