// @ts-nocheck

export function createPathRuntime(config) {
  const manifestFileByKey = new Map();
  const manifestDirs = new Set();

  function normalizePath(value) {
    const raw = String(value ?? "").replace(/\\+/g, "/");
    const hasLeadingSlash = raw.startsWith("/");
    const parts = [];
    for (const part of raw.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (parts.length > 0 && parts.at(-1) !== "..") {
          parts.pop();
        } else if (!hasLeadingSlash) {
          parts.push("..");
        }
        continue;
      }
      parts.push(part);
    }
    const normalized = parts.join("/");
    return hasLeadingSlash ? "/" + normalized : normalized || ".";
  }

  function manifestKey(value) {
    let normalized = normalizePath(value);
    if (normalized === ".") return "";
    normalized = normalized.replace(/^\/+/, "");
    while (normalized.startsWith("./")) {
      normalized = normalized.slice(2);
    }
    return normalized;
  }

  function manifestAliases(value) {
    const key = manifestKey(value);
    const aliases = new Set();
    if (key) aliases.add(key);
    if (key) {
      let withoutWebRoot = key;
      while (withoutWebRoot.toLowerCase().startsWith("www/")) {
        withoutWebRoot = withoutWebRoot.slice(4);
        if (withoutWebRoot) aliases.add(withoutWebRoot);
      }
      if (withoutWebRoot) aliases.add("www/" + withoutWebRoot);
    }
    return Array.from(aliases).filter(Boolean);
  }

  function addManifestDirAliases(value) {
    for (const alias of manifestAliases(value)) {
      let current = alias.includes("/") ? alias.slice(0, alias.lastIndexOf("/")) : "";
      while (current) {
        manifestDirs.add(current);
        if (current.toLowerCase().startsWith("www/")) {
          manifestDirs.add(current.slice(4));
        }
        const index = current.lastIndexOf("/");
        current = index < 0 ? "" : current.slice(0, index);
      }
    }
  }

  for (const file of config.files) {
    for (const alias of manifestAliases(file.path)) {
      manifestFileByKey.set(alias, file);
      manifestFileByKey.set(alias.toLowerCase(), file);
    }
    addManifestDirAliases(file.path);
  }

  function trimTrailingSlash(value) {
    return value.length > 1 ? value.replace(/\/+$/, "") : value;
  }

  function dirname(value) {
    const normalized = trimTrailingSlash(normalizePath(value));
    if (normalized === "." || normalized === "/") return normalized;
    const index = normalized.lastIndexOf("/");
    if (index < 0) return ".";
    if (index === 0) return "/";
    return normalized.slice(0, index);
  }

  function basename(value, ext) {
    const normalized = trimTrailingSlash(normalizePath(value));
    const index = normalized.lastIndexOf("/");
    const base = index < 0 ? normalized : normalized.slice(index + 1);
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
  }

  function extname(value) {
    return parse(value).ext;
  }

  function parse(value) {
    const raw = String(value ?? "").replace(/\\+/g, "/");
    const root = raw.startsWith("/") ? "/" : "";
    let end = raw.length - 1;
    while (end >= 0 && raw[end] === "/") end -= 1;

    if (end < 0) {
      return { root, dir: root, base: "", ext: "", name: "" };
    }

    const separatorIndex = raw.lastIndexOf("/", end);
    const base = raw.slice(separatorIndex + 1, end + 1);
    const dir = separatorIndex < 0 ? "" : separatorIndex === 0 ? root : raw.slice(0, separatorIndex);
    const extensionIndex = base.lastIndexOf(".");
    const hasExtension = extensionIndex > 0 && base !== "..";
    const ext = hasExtension ? base.slice(extensionIndex) : "";
    const name = hasExtension ? base.slice(0, extensionIndex) : base;

    return { root, dir, base, ext, name };
  }

  function joinPath() {
    return normalizePath(Array.from(arguments).filter(Boolean).join("/"));
  }

  function isAbsolute(value) {
    return String(value ?? "").replace(/\\+/g, "/").startsWith("/");
  }

  function resolvePath() {
    const values = Array.from(arguments);
    let resolved = "";
    let absolute = false;
    for (let index = values.length - 1; index >= -1; index -= 1) {
      const value = index >= 0 ? String(values[index] ?? "") : "/www";
      if (!value) continue;
      resolved = value.replace(/\\+/g, "/") + "/" + resolved;
      if (isAbsolute(value)) {
        absolute = true;
        break;
      }
    }
    const normalized = normalizePath(resolved);
    return absolute && !normalized.startsWith("/") ? "/" + normalized : normalized;
  }

  function relative(from, to) {
    const fromParts = resolvePath(from).replace(/^\/+/, "").split("/").filter(Boolean);
    const toParts = resolvePath(to).replace(/^\/+/, "").split("/").filter(Boolean);
    let shared = 0;
    while (
      shared < fromParts.length &&
      shared < toParts.length &&
      fromParts[shared] === toParts[shared]
    ) {
      shared += 1;
    }
    return [
      ...Array.from({ length: fromParts.length - shared }, () => ".."),
      ...toParts.slice(shared),
    ].join("/");
  }

  function format(pathObject) {
    if (!pathObject || typeof pathObject !== "object") {
      throw new TypeError("path.format requires a path object.");
    }
    const dir = pathObject.dir || pathObject.root || "";
    const rawExtension = String(pathObject.ext ?? "");
    const extension = rawExtension && !rawExtension.startsWith(".") ? "." + rawExtension : rawExtension;
    const base = pathObject.base || String(pathObject.name ?? "") + extension;
    if (!dir) return base;
    return dir === "/" ? dir + base : trimTrailingSlash(String(dir).replace(/\\+/g, "/")) + "/" + base;
  }

  function lookupManifestFile(path) {
    for (const alias of manifestAliases(path)) {
      const exact = manifestFileByKey.get(alias);
      if (exact) return exact;
      const lower = manifestFileByKey.get(alias.toLowerCase());
      if (lower) return lower;
    }
    return null;
  }

  function manifestDirExists(path) {
    if (!manifestKey(path)) return config.files.length > 0;
    for (const alias of manifestAliases(path)) {
      if (manifestDirs.has(alias) || manifestDirs.has(alias.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  const pathModule = {
    sep: "/",
    delimiter: ":",
    join: joinPath,
    normalize: normalizePath,
    dirname,
    basename,
    extname,
    parse,
    format,
    isAbsolute,
    relative,
    resolve: resolvePath,
    toNamespacedPath: (value) => value,
  };
  pathModule.posix = pathModule;
  pathModule.win32 = {
    ...pathModule,
    delimiter: ";",
    sep: "\\",
    join: function join() {
      return joinPath.apply(null, arguments).replace(/\//g, "\\");
    },
    normalize: (value) => normalizePath(value).replace(/\//g, "\\"),
    dirname: (value) => dirname(value).replace(/\//g, "\\"),
    relative: (from, to) => relative(from, to).replace(/\//g, "\\"),
    resolve: function resolve() {
      return resolvePath.apply(null, arguments).replace(/\//g, "\\");
    },
  };

  return {
    basename,
    dirname,
    extname,
    isAbsolute,
    joinPath,
    lookupManifestFile,
    manifestAliases,
    manifestDirExists,
    manifestKey,
    normalizePath,
    resolvePath,
    pathModule,
    trimTrailingSlash,
  };
}
