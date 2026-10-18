// @ts-nocheck

function normalizeParts(value) {
  const raw = String(value ?? "").replace(/\\+/gu, "/");
  const absolute = raw.startsWith("/");
  const parts = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length && parts.at(-1) !== "..") parts.pop();
      else if (!absolute) parts.push(part);
    } else {
      parts.push(part);
    }
  }
  return { absolute, parts };
}

export function normalize(value) {
  const { absolute, parts } = normalizeParts(value);
  const result = parts.join("/");
  return (absolute ? "/" : "") + (result || (absolute ? "" : "."));
}

export function join() {
  return normalize(Array.from(arguments).filter(Boolean).join("/"));
}

export function resolve() {
  const values = Array.from(arguments);
  let result = "";
  for (let index = values.length - 1; index >= -1; index -= 1) {
    const value = index < 0 ? "/www" : String(values[index] ?? "");
    if (!value) continue;
    result = value + (result ? "/" + result : "");
    if (value.startsWith("/")) break;
  }
  const normalized = normalize(result);
  return normalized.startsWith("/") ? normalized : "/" + normalized;
}

export const isAbsolute = (value) =>
  String(value ?? "").replace(/\\+/gu, "/").startsWith("/");

export function dirname(value) {
  const normalized = normalize(value).replace(/\/+$/u, "");
  if (normalized === "/" || normalized === ".") return normalized;
  const index = normalized.lastIndexOf("/");
  if (index < 0) return ".";
  return index === 0 ? "/" : normalized.slice(0, index);
}

export function basename(value, extension) {
  const normalized = normalize(value).replace(/\/+$/u, "");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  return extension && base.endsWith(extension)
    ? base.slice(0, -extension.length)
    : base;
}

export function extname(value) {
  const base = basename(value);
  const index = base.lastIndexOf(".");
  return index > 0 ? base.slice(index) : "";
}

export function parse(value) {
  const root = isAbsolute(value) ? "/" : "";
  const base = basename(value);
  const ext = extname(base);
  return {
    root,
    dir: dirname(value),
    base,
    ext,
    name: ext ? base.slice(0, -ext.length) : base,
  };
}

export function format(value) {
  const directory = value.dir || value.root || "";
  const base = value.base || String(value.name || "") + String(value.ext || "");
  return directory ? join(directory, base) : base;
}

export function relative(from, to) {
  const fromParts = normalize(resolve(from)).split("/").filter(Boolean);
  const toParts = normalize(resolve(to)).split("/").filter(Boolean);
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => ".."), ...toParts].join("/");
}
export const sep = "/";
export const delimiter = ":";
export const posix = {
  basename,
  delimiter,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
  resolve,
  sep,
};
export const win32 = posix;

export default posix;
