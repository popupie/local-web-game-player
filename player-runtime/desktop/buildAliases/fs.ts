// @ts-nocheck

function runtimeFs(required = true) {
  const fs = globalThis.MzPlayerDesktop?.fs;
  if (!fs && required) {
    throw new Error("The Local Web Game Player fs runtime is not ready.");
  }
  return fs;
}

function call(name, args) {
  return runtimeFs()[name](...args);
}

export const access = (...args) => call("access", args);
export const accessSync = (...args) => call("accessSync", args);
export const appendFile = (...args) => call("appendFile", args);
export const appendFileSync = (...args) => call("appendFileSync", args);
export const copyFile = (...args) => call("copyFile", args);
export const copyFileSync = (...args) => call("copyFileSync", args);
export const exists = (path, callback) => {
  const fs = runtimeFs(false);
  if (fs) return fs.exists(path, callback);
  queueMicrotask(() => callback(false));
};
export const existsSync = (...args) => runtimeFs(false)?.existsSync(...args) ?? false;
export const mkdir = (...args) => call("mkdir", args);
export const mkdirSync = (...args) => call("mkdirSync", args);
export const readFile = (...args) => call("readFile", args);
export const readFileSync = (...args) => call("readFileSync", args);
export const readdir = (...args) => call("readdir", args);
export const readdirSync = (...args) => call("readdirSync", args);
export const rename = (...args) => call("rename", args);
export const renameSync = (...args) => call("renameSync", args);
export const stat = (...args) => call("stat", args);
export const statSync = (...args) => call("statSync", args);
export const unlink = (...args) => call("unlink", args);
export const unlinkSync = (...args) => call("unlinkSync", args);
export const writeFile = (...args) => call("writeFile", args);
export const writeFileSync = (...args) => call("writeFileSync", args);

export const promises = new Proxy({}, {
  get(_target, name) {
    return (...args) => runtimeFs().promises[name](...args);
  },
});

export default {
  access,
  accessSync,
  appendFile,
  appendFileSync,
  copyFile,
  copyFileSync,
  exists,
  existsSync,
  mkdir,
  mkdirSync,
  promises,
  readFile,
  readFileSync,
  readdir,
  readdirSync,
  rename,
  renameSync,
  stat,
  statSync,
  unlink,
  unlinkSync,
  writeFile,
  writeFileSync,
};
