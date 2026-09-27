export function normalizeStoredPath(path: string): string {
  const decoded = path.replaceAll("\\", "/").replace(/^\/+/, "");
  const parts: string[] = [];

  for (const rawPart of decoded.split("/")) {
    const part = rawPart.trim();
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join("/");
}

export function unicodePathAliases(path: string): string[] {
  const normalized = normalizeStoredPath(path);
  if (!normalized) return [];

  const aliases: string[] = [];
  const seen = new Set([normalized]);

  for (const candidate of [normalized.normalize("NFC"), normalized.normalize("NFD")]) {
    const alias = normalizeStoredPath(candidate);
    if (!alias || seen.has(alias)) continue;
    aliases.push(alias);
    seen.add(alias);
  }

  return aliases;
}

// Reverse maps for filenames where Shift_JIS bytes were decoded as legacy single-byte ZIP encodings.
const mojibakeDecodeTables = [
  {
    encoding: "cp437",
    chars:
      "\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00a2\u00a3\u00a5\u20a7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u2310\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u255e\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u2567\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256b\u256a\u2518\u250c\u2588\u2584\u258c\u2590\u2580\u03b1\u00df\u0393\u03c0\u03a3\u03c3\u00b5\u03c4\u03a6\u0398\u03a9\u03b4\u221e\u03c6\u03b5\u2229\u2261\u00b1\u2265\u2264\u2320\u2321\u00f7\u2248\u00b0\u2219\u00b7\u221a\u207f\u00b2\u25a0\u00a0"
  },
  {
    encoding: "cp850",
    chars:
      "\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00f8\u00a3\u00d8\u00d7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u00ae\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u00c1\u00c2\u00c0\u00a9\u2563\u2551\u2557\u255d\u00a2\u00a5\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u00e3\u00c3\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u00a4\u00f0\u00d0\u00ca\u00cb\u00c8\u0131\u00cd\u00ce\u00cf\u2518\u250c\u2588\u2584\u00a6\u00cc\u2580\u00d3\u00df\u00d4\u00d2\u00f5\u00d5\u00b5\u00fe\u00de\u00da\u00db\u00d9\u00fd\u00dd\u00af\u00b4\u00ad\u00b1\u2017\u00be\u00b6\u00a7\u00f7\u00b8\u00b0\u00a8\u00b7\u00b9\u00b3\u00b2\u25a0\u00a0"
  },
  {
    encoding: "mac_roman",
    chars:
      "\u00c4\u00c5\u00c7\u00c9\u00d1\u00d6\u00dc\u00e1\u00e0\u00e2\u00e4\u00e3\u00e5\u00e7\u00e9\u00e8\u00ea\u00eb\u00ed\u00ec\u00ee\u00ef\u00f1\u00f3\u00f2\u00f4\u00f6\u00f5\u00fa\u00f9\u00fb\u00fc\u2020\u00b0\u00a2\u00a3\u00a7\u2022\u00b6\u00df\u00ae\u00a9\u2122\u00b4\u00a8\u2260\u00c6\u00d8\u221e\u00b1\u2264\u2265\u00a5\u00b5\u2202\u2211\u220f\u03c0\u222b\u00aa\u00ba\u03a9\u00e6\u00f8\u00bf\u00a1\u00ac\u221a\u0192\u2248\u2206\u00ab\u00bb\u2026\u00a0\u00c0\u00c3\u00d5\u0152\u0153\u2013\u2014\u201c\u201d\u2018\u2019\u00f7\u25ca\u00ff\u0178\u2044\u20ac\u2039\u203a\ufb01\ufb02\u2021\u00b7\u201a\u201e\u2030\u00c2\u00ca\u00c1\u00cb\u00c8\u00cd\u00ce\u00cf\u00cc\u00d3\u00d4\uf8ff\u00d2\u00da\u00db\u00d9\u0131\u02c6\u02dc\u00af\u02d8\u02d9\u02da\u00b8\u02dd\u02db\u02c7"
  }
] as const;

function bytesFromMojibake(value: string, table: string, slashAsBackslashAt = -1): Uint8Array | undefined {
  const bytes: number[] = [];
  let slashIndex = 0;

  for (const char of value) {
    if (char === "/") {
      bytes.push(slashIndex === slashAsBackslashAt ? 0x5c : 0x2f);
      slashIndex += 1;
      continue;
    }

    const code = char.codePointAt(0);
    if (code !== undefined && code < 0x80) {
      bytes.push(code);
      continue;
    }

    const index = table.indexOf(char);
    if (index < 0) return undefined;
    bytes.push(index + 0x80);
  }

  return new Uint8Array(bytes);
}

function decodeShiftJis(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("shift_jis", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

export function mojibakePathAliases(path: string): string[] {
  const normalized = normalizeStoredPath(path);
  if (!normalized) return [];

  const aliases: string[] = [];
  const seen = new Set([normalized]);
  const slashCount = Array.from(normalized).filter((char) => char === "/").length;

  function addAlias(candidate: string | undefined) {
    if (!candidate) return;
    const alias = normalizeStoredPath(candidate);
    if (!alias || seen.has(alias)) return;
    aliases.push(alias);
    seen.add(alias);
  }

  for (const table of mojibakeDecodeTables) {
    const bytes = bytesFromMojibake(normalized, table.chars);
    if (bytes) addAlias(decodeShiftJis(bytes));
    for (let slashIndex = 0; slashIndex < slashCount; slashIndex += 1) {
      const slashBytes = bytesFromMojibake(normalized, table.chars, slashIndex);
      if (slashBytes) addAlias(decodeShiftJis(slashBytes));
    }
  }

  return aliases;
}

function pathWithExtension(path: string, extension: string): string | undefined {
  const index = path.lastIndexOf(".");
  if (index < 0) return undefined;
  return path.slice(0, index) + extension;
}

function suffixedPathCandidates(path: string): string[] {
  return [`${path}_`, `${path}__`, `${path}___`];
}

function pathWithoutSuffixMarkers(path: string): string {
  return path.replace(/_+$/u, "");
}

const plainImageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;
const encryptedImageSuffixes = [".png_", ".png__", ".png___"] as const;
const plainAudioExtensions = [".ogg", ".m4a", ".mp3", ".wav", ".oga"] as const;
const encryptedAudioExtensions = [".rpgmvo", ".rpgmvm"] as const;
const plainVideoExtensions = [".webm", ".mp4"] as const;

export function rpgMakerAssetPathAliases(path: string): string[] {
  const normalized = normalizeStoredPath(path);
  if (!normalized) return [];

  const lowerPath = normalized.toLowerCase();
  const unsuffixedPath = pathWithoutSuffixMarkers(normalized);
  const lowerUnsuffixedPath = unsuffixedPath.toLowerCase();
  const aliases: string[] = [];

  function add(candidate: string | undefined) {
    if (candidate && candidate !== normalized && !aliases.includes(candidate)) {
      aliases.push(candidate);
    }
  }

  for (const imageExtension of plainImageExtensions) {
    if (!lowerPath.endsWith(imageExtension)) continue;
    const stem = normalized.slice(0, -imageExtension.length);
    add(`${stem}.rpgmvp`);
    if (imageExtension === ".png") {
      for (const encryptedSuffix of encryptedImageSuffixes) add(`${stem}${encryptedSuffix}`);
    }
    return aliases;
  }

  if (lowerPath.endsWith(".rpgmvp")) {
    for (const encryptedSuffix of encryptedImageSuffixes) add(pathWithExtension(normalized, encryptedSuffix));
    for (const imageExtension of plainImageExtensions) add(pathWithExtension(normalized, imageExtension));
    return aliases;
  }

  for (const encryptedSuffix of encryptedImageSuffixes) {
    if (!lowerPath.endsWith(encryptedSuffix)) continue;
    const stem = normalized.slice(0, -encryptedSuffix.length);
    add(`${stem}.rpgmvp`);
    for (const candidateSuffix of encryptedImageSuffixes) add(`${stem}${candidateSuffix}`);
    for (const imageExtension of plainImageExtensions) add(`${stem}${imageExtension}`);
    return aliases;
  }

  if (plainAudioExtensions.some((extension) => lowerUnsuffixedPath.endsWith(extension))) {
    add(unsuffixedPath);
    for (const candidate of suffixedPathCandidates(unsuffixedPath)) add(candidate);
    for (const encryptedExtension of encryptedAudioExtensions) {
      const encryptedPath = pathWithExtension(unsuffixedPath, encryptedExtension);
      add(encryptedPath);
      if (encryptedPath) {
        for (const candidate of suffixedPathCandidates(encryptedPath)) add(candidate);
      }
    }
    return aliases;
  }

  if (encryptedAudioExtensions.some((extension) => lowerUnsuffixedPath.endsWith(extension))) {
    add(unsuffixedPath);
    for (const candidate of suffixedPathCandidates(unsuffixedPath)) add(candidate);
    for (const plainExtension of plainAudioExtensions) {
      const plainPath = pathWithExtension(unsuffixedPath, plainExtension);
      add(plainPath);
      if (plainPath) {
        for (const candidate of suffixedPathCandidates(plainPath)) add(candidate);
      }
    }
    return aliases;
  }

  if (plainVideoExtensions.some((extension) => lowerUnsuffixedPath.endsWith(extension))) {
    add(unsuffixedPath);
    for (const candidate of suffixedPathCandidates(unsuffixedPath)) add(candidate);
    for (const videoExtension of plainVideoExtensions) {
      const videoPath = pathWithExtension(unsuffixedPath, videoExtension);
      add(videoPath);
      if (videoPath) {
        for (const candidate of suffixedPathCandidates(videoPath)) add(candidate);
      }
    }
    return aliases;
  }

  return aliases;
}

export function pathLookupAliases(path: string): string[] {
  const normalized = normalizeStoredPath(path);
  if (!normalized) return [];

  const aliases: string[] = [];
  const seen = new Set([normalized]);

  function addAlias(candidate: string | undefined) {
    if (!candidate || seen.has(candidate)) return;
    aliases.push(candidate);
    seen.add(candidate);
  }

  const baseCandidates: string[] = [normalized];
  for (const alias of unicodePathAliases(normalized)) baseCandidates.push(alias);
  for (const alias of mojibakePathAliases(normalized)) {
    baseCandidates.push(alias);
    for (const unicodeAlias of unicodePathAliases(alias)) baseCandidates.push(unicodeAlias);
  }

  for (const candidate of baseCandidates) {
    addAlias(candidate);
    for (const assetAlias of rpgMakerAssetPathAliases(candidate)) {
      addAlias(assetAlias);
      for (const unicodeAlias of unicodePathAliases(assetAlias)) addAlias(unicodeAlias);
    }
  }

  return aliases;
}

export function stripCommonWrapper<T extends { path: string }>(entries: T[]): T[] {
  const paths = entries.map((entry) => normalizeStoredPath(entry.path)).filter(Boolean);
  if (paths.length === 0) return entries;

  const firstSegments = paths.map((path) => path.split("/")[0]);
  const wrapper = firstSegments[0];
  const hasOneWrapper = Boolean(wrapper) && firstSegments.every((segment) => segment === wrapper);
  const wrapperContainsIndex = paths.some((path) => path === `${wrapper}/index.html` || path === `${wrapper}/www/index.html`);

  if (!hasOneWrapper || !wrapperContainsIndex) {
    return entries.map((entry) => ({ ...entry, path: normalizeStoredPath(entry.path) }));
  }

  return entries
    .map((entry) => ({
      ...entry,
      path: normalizeStoredPath(entry.path).split("/").slice(1).join("/")
    }))
    .filter((entry) => entry.path);
}

export function findEntryPath(paths: string[]): string {
  const normalized = paths.map(normalizeStoredPath);
  if (normalized.includes("index.html")) return "index.html";
  if (normalized.includes("www/index.html")) return "www/index.html";

  const candidates = normalized.filter((path) => path.endsWith("/index.html"));
  if (candidates.length > 0) return candidates.sort((a, b) => a.length - b.length)[0];

  throw new Error("Could not find index.html in this game.");
}

export function titleFromEntry(paths: string[], fallback: string): string {
  const normalizedFallback = fallback.replace(/\.[^.]+$/, "").trim();
  const topSegments = paths.map(normalizeStoredPath).map((path) => path.split("/")[0]).filter(Boolean);
  const first = topSegments[0];
  const commonTop = first && topSegments.every((segment) => segment === first) ? first : "";
  const folderTitle = commonTop && !commonTop.includes(".") ? commonTop : "";
  return folderTitle || normalizedFallback || "Imported Game";
}
