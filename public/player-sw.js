const DB_NAME = "mvmz-browser-player";
const DB_VERSION = 2;
const GAME_STORE = "games";
const FILE_STORE = "files";
const BLOB_STORE = "blobs";
const HANDLE_STORE = "handles";
const PLAYER_DESKTOP_RUNTIME_VERSION = "desktop-api-8";
const PLAYER_BRIDGE_RUNTIME_VERSION = "bridge-api-5";
const SESSION_FILE_TIMEOUT_MS = 10000;
const EMPTY_SOURCE_MAP_TEXT = "{\"version\":3,\"sources\":[],\"mappings\":\"\"}";
const RPG_MAKER_ENCRYPTED_HEADER_BYTES = Uint8Array.from([
  0x52, 0x50, 0x47, 0x4d, 0x56, 0x00, 0x00, 0x00,
  0x00, 0x03, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
const PLAIN_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const ENCRYPTED_IMAGE_SUFFIXES = [".png_", ".png__", ".png___"];
const PLAIN_AUDIO_EXTENSIONS = [".ogg", ".m4a", ".mp3", ".wav", ".oga"];
const ENCRYPTED_AUDIO_EXTENSIONS = [".rpgmvo", ".rpgmvm"];
const PLAIN_VIDEO_EXTENSIONS = [".webm", ".mp4"];
const PNG_HEADER_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_HEADER_BYTES = Uint8Array.from([0xff, 0xd8, 0xff]);
const GIF87A_HEADER_BYTES = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
const GIF89A_HEADER_BYTES = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP_RIFF_HEADER_BYTES = Uint8Array.from([0x52, 0x49, 0x46, 0x46]);
const WEBP_WEBP_HEADER_BYTES = Uint8Array.from([0x57, 0x45, 0x42, 0x50]);
const OGG_HEADER_BYTES = Uint8Array.from([0x4f, 0x67, 0x67, 0x53]);
const RIFF_HEADER_BYTES = Uint8Array.from([0x52, 0x49, 0x46, 0x46]);
const WAVE_HEADER_BYTES = Uint8Array.from([0x57, 0x41, 0x56, 0x45]);
const ID3_HEADER_BYTES = Uint8Array.from([0x49, 0x44, 0x33]);
const EBML_HEADER_BYTES = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]);
const FTYP_HEADER_BYTES = Uint8Array.from([0x66, 0x74, 0x79, 0x70]);
let dbPromise;
const gameCache = new Map();
const fileCache = new Map();
const encryptionKeyCache = new Map();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/play/"))
    return;

  event.respondWith(serveGameFile(url, event.request));
});

self.addEventListener("message", (event) => {
  if (
    event.data &&
    event.data.type === "clear-game-cache" &&
    event.data.gameId
  ) {
    gameCache.delete(event.data.gameId);
    fileCache.delete(event.data.gameId);
    encryptionKeyCache.delete(event.data.gameId);
    return;
  }
  if (event.data && event.data.type === "clear-player-cache") {
    event.waitUntil(clearPlayerCache(event));
    return;
  }
});

async function clearPlayerCache(event) {
  gameCache.clear();
  fileCache.clear();
  encryptionKeyCache.clear();
  try {
    const db = dbPromise ? await dbPromise : undefined;
    if (db) db.close();
  } catch {
    // The database may have failed to open; clearing cache maps is still useful.
  } finally {
    dbPromise = undefined;
  }
  if (event.ports && event.ports[0]) {
    event.ports[0].postMessage({ type: "clear-player-cache-done" });
  }
}

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GAME_STORE))
        db.createObjectStore(GAME_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        const store = db.createObjectStore(FILE_STORE, { keyPath: "key" });
        store.createIndex("gameId", "gameId", { unique: false });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE))
        db.createObjectStore(BLOB_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(HANDLE_STORE))
        db.createObjectStore(HANDLE_STORE, { keyPath: "gameId" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = undefined;
        gameCache.clear();
        fileCache.clear();
        encryptionKeyCache.clear();
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = undefined;
      reject(request.error || new Error("IndexedDB open failed."));
    };
  });

  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("IndexedDB request failed."));
  });
}

function normalizePath(path) {
  const parts = [];
  for (const rawPart of path
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .split("/")) {
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

function unicodePathAliases(path) {
  const normalized = normalizePath(path);
  if (!normalized) return [];
  const aliases = [];
  const seen = new Set([normalized]);

  for (const candidate of [
    normalized.normalize("NFC"),
    normalized.normalize("NFD"),
  ]) {
    const alias = normalizePath(candidate);
    if (!alias || seen.has(alias)) continue;
    aliases.push(alias);
    seen.add(alias);
  }

  return aliases;
}

// Reverse maps for filenames where Shift_JIS bytes were decoded as legacy single-byte ZIP encodings.
const MOJIBAKE_DECODE_TABLES = [
  {
    encoding: "cp437",
    chars:
      "\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00a2\u00a3\u00a5\u20a7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u2310\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u255e\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u2567\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256b\u256a\u2518\u250c\u2588\u2584\u258c\u2590\u2580\u03b1\u00df\u0393\u03c0\u03a3\u03c3\u00b5\u03c4\u03a6\u0398\u03a9\u03b4\u221e\u03c6\u03b5\u2229\u2261\u00b1\u2265\u2264\u2320\u2321\u00f7\u2248\u00b0\u2219\u00b7\u221a\u207f\u00b2\u25a0\u00a0",
  },
  {
    encoding: "cp850",
    chars:
      "\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00f8\u00a3\u00d8\u00d7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u00ae\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u00c1\u00c2\u00c0\u00a9\u2563\u2551\u2557\u255d\u00a2\u00a5\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u00e3\u00c3\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u00a4\u00f0\u00d0\u00ca\u00cb\u00c8\u0131\u00cd\u00ce\u00cf\u2518\u250c\u2588\u2584\u00a6\u00cc\u2580\u00d3\u00df\u00d4\u00d2\u00f5\u00d5\u00b5\u00fe\u00de\u00da\u00db\u00d9\u00fd\u00dd\u00af\u00b4\u00ad\u00b1\u2017\u00be\u00b6\u00a7\u00f7\u00b8\u00b0\u00a8\u00b7\u00b9\u00b3\u00b2\u25a0\u00a0",
  },
  {
    encoding: "mac_roman",
    chars:
      "\u00c4\u00c5\u00c7\u00c9\u00d1\u00d6\u00dc\u00e1\u00e0\u00e2\u00e4\u00e3\u00e5\u00e7\u00e9\u00e8\u00ea\u00eb\u00ed\u00ec\u00ee\u00ef\u00f1\u00f3\u00f2\u00f4\u00f6\u00f5\u00fa\u00f9\u00fb\u00fc\u2020\u00b0\u00a2\u00a3\u00a7\u2022\u00b6\u00df\u00ae\u00a9\u2122\u00b4\u00a8\u2260\u00c6\u00d8\u221e\u00b1\u2264\u2265\u00a5\u00b5\u2202\u2211\u220f\u03c0\u222b\u00aa\u00ba\u03a9\u00e6\u00f8\u00bf\u00a1\u00ac\u221a\u0192\u2248\u2206\u00ab\u00bb\u2026\u00a0\u00c0\u00c3\u00d5\u0152\u0153\u2013\u2014\u201c\u201d\u2018\u2019\u00f7\u25ca\u00ff\u0178\u2044\u20ac\u2039\u203a\ufb01\ufb02\u2021\u00b7\u201a\u201e\u2030\u00c2\u00ca\u00c1\u00cb\u00c8\u00cd\u00ce\u00cf\u00cc\u00d3\u00d4\uf8ff\u00d2\u00da\u00db\u00d9\u0131\u02c6\u02dc\u00af\u02d8\u02d9\u02da\u00b8\u02dd\u02db\u02c7",
  },
];

function bytesFromMojibake(value, table, slashAsBackslashAt = -1) {
  const bytes = [];
  let slashIndex = 0;
  for (const char of value) {
    if (char === "/") {
      bytes.push(slashIndex === slashAsBackslashAt ? 0x5c : 0x2f);
      slashIndex += 1;
      continue;
    }
    const code = char.codePointAt(0);
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    const index = table.indexOf(char);
    if (index < 0) return undefined;
    bytes.push(index + 0x80);
  }
  return new Uint8Array(bytes);
}

function decodeShiftJis(bytes) {
  try {
    return new TextDecoder("shift_jis", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function mojibakePathAliases(path) {
  const normalized = normalizePath(path);
  if (!normalized) return [];
  const aliases = [];
  const seen = new Set([normalized]);
  const slashCount = Array.from(normalized).filter(
    (char) => char === "/",
  ).length;

  function addAlias(candidate) {
    if (!candidate) return;
    const alias = normalizePath(candidate);
    if (!alias || seen.has(alias)) return;
    aliases.push(alias);
    seen.add(alias);
  }

  for (const table of MOJIBAKE_DECODE_TABLES) {
    const bytes = bytesFromMojibake(normalized, table.chars);
    if (bytes) addAlias(decodeShiftJis(bytes));
    for (let slashIndex = 0; slashIndex < slashCount; slashIndex += 1) {
      const slashBytes = bytesFromMojibake(normalized, table.chars, slashIndex);
      if (slashBytes) addAlias(decodeShiftJis(slashBytes));
    }
  }

  return aliases;
}

function pathWithExtension(path, extension) {
  const index = path.lastIndexOf(".");
  if (index < 0) return undefined;
  return path.slice(0, index) + extension;
}

function suffixedPathCandidates(path) {
  return [path + "_", path + "__", path + "___"];
}

function pathWithoutSuffixMarkers(path) {
  return path.replace(/_+$/u, "");
}

function rpgMakerAssetPathAliases(path) {
  const normalized = normalizePath(path);
  if (!normalized) return [];

  const lowerPath = normalized.toLowerCase();
  const unsuffixedPath = pathWithoutSuffixMarkers(normalized);
  const lowerUnsuffixedPath = unsuffixedPath.toLowerCase();
  const aliases = [];

  function add(candidate) {
    if (candidate && candidate !== normalized && !aliases.includes(candidate)) {
      aliases.push(candidate);
    }
  }

  function addSystemWindowFallbacks(stem) {
    const index = stem.lastIndexOf("/");
    const directory = index < 0 ? "" : stem.slice(0, index);
    const filename = index < 0 ? stem : stem.slice(index + 1);
    const lowerDirectory = directory.toLowerCase();
    if (
      filename.toLowerCase() !== "systemwindow" ||
      (lowerDirectory !== "img/system" && !lowerDirectory.endsWith("/img/system"))
    ) {
      return;
    }
    const fallbackStem = (directory ? directory + "/" : "") + "Window";
    add(fallbackStem + ".rpgmvp");
    for (const suffix of ENCRYPTED_IMAGE_SUFFIXES) add(fallbackStem + suffix);
    for (const extension of PLAIN_IMAGE_EXTENSIONS) add(fallbackStem + extension);
  }

  for (const imageExtension of PLAIN_IMAGE_EXTENSIONS) {
    if (!lowerPath.endsWith(imageExtension)) continue;
    const stem = normalized.slice(0, -imageExtension.length);
    add(stem + ".rpgmvp");
    if (imageExtension === ".png") {
      for (const encryptedSuffix of ENCRYPTED_IMAGE_SUFFIXES) add(stem + encryptedSuffix);
    }
    addSystemWindowFallbacks(stem);
    return aliases;
  }

  if (lowerPath.endsWith(".rpgmvp")) {
    const stem = normalized.slice(0, -".rpgmvp".length);
    for (const encryptedSuffix of ENCRYPTED_IMAGE_SUFFIXES) {
      add(pathWithExtension(normalized, encryptedSuffix));
    }
    for (const imageExtension of PLAIN_IMAGE_EXTENSIONS) {
      add(pathWithExtension(normalized, imageExtension));
    }
    addSystemWindowFallbacks(stem);
    return aliases;
  }

  for (const encryptedSuffix of ENCRYPTED_IMAGE_SUFFIXES) {
    if (!lowerPath.endsWith(encryptedSuffix)) continue;
    const stem = normalized.slice(0, -encryptedSuffix.length);
    add(stem + ".rpgmvp");
    for (const candidateSuffix of ENCRYPTED_IMAGE_SUFFIXES) add(stem + candidateSuffix);
    for (const imageExtension of PLAIN_IMAGE_EXTENSIONS) add(stem + imageExtension);
    addSystemWindowFallbacks(stem);
    return aliases;
  }

  if (PLAIN_AUDIO_EXTENSIONS.some((extension) => lowerUnsuffixedPath.endsWith(extension))) {
    add(unsuffixedPath);
    for (const candidate of suffixedPathCandidates(unsuffixedPath)) add(candidate);
    for (const encryptedExtension of ENCRYPTED_AUDIO_EXTENSIONS) {
      const encryptedPath = pathWithExtension(unsuffixedPath, encryptedExtension);
      add(encryptedPath);
      if (encryptedPath) {
        for (const candidate of suffixedPathCandidates(encryptedPath)) add(candidate);
      }
    }
    return aliases;
  }

  if (ENCRYPTED_AUDIO_EXTENSIONS.some((extension) => lowerUnsuffixedPath.endsWith(extension))) {
    add(unsuffixedPath);
    for (const candidate of suffixedPathCandidates(unsuffixedPath)) add(candidate);
    for (const plainExtension of PLAIN_AUDIO_EXTENSIONS) {
      const plainPath = pathWithExtension(unsuffixedPath, plainExtension);
      add(plainPath);
      if (plainPath) {
        for (const candidate of suffixedPathCandidates(plainPath)) add(candidate);
      }
    }
    return aliases;
  }

  if (PLAIN_VIDEO_EXTENSIONS.some((extension) => lowerUnsuffixedPath.endsWith(extension))) {
    add(unsuffixedPath);
    for (const candidate of suffixedPathCandidates(unsuffixedPath)) add(candidate);
    for (const videoExtension of PLAIN_VIDEO_EXTENSIONS) {
      const videoPath = pathWithExtension(unsuffixedPath, videoExtension);
      add(videoPath);
      if (videoPath) {
        for (const candidate of suffixedPathCandidates(videoPath)) {
          add(candidate);
        }
      }
    }
    return aliases;
  }

  return aliases;
}

function pathLookupAliases(path) {
  const normalized = normalizePath(path);
  if (!normalized) return [];
  const aliases = [];
  const seen = new Set([normalized]);

  function addAlias(candidate) {
    if (!candidate || seen.has(candidate)) return;
    aliases.push(candidate);
    seen.add(candidate);
  }

  const baseCandidates = [normalized];
  for (const alias of unicodePathAliases(normalized)) baseCandidates.push(alias);
  for (const alias of mojibakePathAliases(normalized)) {
    baseCandidates.push(alias);
    for (const unicodeAlias of unicodePathAliases(alias)) {
      baseCandidates.push(unicodeAlias);
    }
  }

  for (const candidate of baseCandidates) {
    addAlias(candidate);
    for (const assetAlias of rpgMakerAssetPathAliases(candidate)) {
      addAlias(assetAlias);
      for (const unicodeAlias of unicodePathAliases(assetAlias)) {
        addAlias(unicodeAlias);
      }
    }
  }

  return aliases;
}

function setIfAbsent(map, key, value) {
  if (key && !map.has(key)) map.set(key, value);
}

function getMatchByPathWithAliases(map, path) {
  const normalized = normalizePath(path);
  const candidates = [normalized, ...pathLookupAliases(normalized)];

  for (const candidate of candidates) {
    const match =
      map.exact.get(candidate) ||
      map.lower.get(candidate.toLowerCase());
    if (match) return { ...match, requestedPath: normalized };
  }

  for (const candidate of candidates) {
    const match =
      map.alias.get(candidate) ||
      map.lowerAlias.get(candidate.toLowerCase());
    if (match) return { ...match, requestedPath: normalized };
  }

  return undefined;
}

function getByPathWithAliases(map, path) {
  return getMatchByPathWithAliases(map, path)?.record;
}

async function getGame(gameId) {
  if (gameCache.has(gameId)) return gameCache.get(gameId);

  const db = await openDb();
  const game = await requestToPromise(
    db.transaction(GAME_STORE, "readonly").objectStore(GAME_STORE).get(gameId),
  );
  gameCache.set(gameId, game);
  return game;
}

async function getGameFileMap(gameId) {
  const cached = fileCache.get(gameId);
  if (cached) return cached;

  const db = await openDb();
  const records = await requestToPromise(
    db
      .transaction(FILE_STORE, "readonly")
      .objectStore(FILE_STORE)
      .index("gameId")
      .getAll(IDBKeyRange.only(gameId)),
  );
  const map = {
    exact: new Map(),
    lower: new Map(),
    alias: new Map(),
    lowerAlias: new Map(),
    records,
  };
  for (const record of records) {
    const normalized = normalizePath(record.path);
    const match = { matchedPath: normalized, record };
    setIfAbsent(map.exact, normalized, match);
    setIfAbsent(map.lower, normalized.toLowerCase(), match);
    for (const alias of pathLookupAliases(normalized)) {
      setIfAbsent(map.alias, alias, match);
      setIfAbsent(map.lowerAlias, alias.toLowerCase(), match);
    }
  }
  fileCache.set(gameId, map);
  return map;
}

async function getStoredFile(gameId, path) {
  const map = await getGameFileMap(gameId);
  return getByPathWithAliases(map, path);
}

async function getStoredFileMatch(gameId, path) {
  const map = await getGameFileMap(gameId);
  return getMatchByPathWithAliases(map, path);
}

async function getGameFiles(gameId) {
  const map = await getGameFileMap(gameId);
  return map.records || [];
}

async function getIndexedDbBlob(storageRef) {
  const db = await openDb();
  const record = await requestToPromise(
    db
      .transaction(BLOB_STORE, "readonly")
      .objectStore(BLOB_STORE)
      .get(storageRef),
  );
  return record && record.blob;
}

async function getLocalFolderHandle(gameId) {
  const db = await openDb();
  const record = await requestToPromise(
    db
      .transaction(HANDLE_STORE, "readonly")
      .objectStore(HANDLE_STORE)
      .get(gameId),
  );
  return record && record.handle;
}

async function getOpfsBlob(gameId, path) {
  try {
    if (!navigator.storage || !navigator.storage.getDirectory) return undefined;
    const parts = normalizePath(path).split("/");
    const name = parts.pop();
    if (!name) return undefined;
    let dir = await navigator.storage.getDirectory();
    dir = await dir.getDirectoryHandle("games");
    dir = await dir.getDirectoryHandle(gameId);
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    const handle = await dir.getFileHandle(name);
    return await handle.getFile();
  } catch {
    return undefined;
  }
}

async function getLocalFolderBlob(gameId, path) {
  try {
    const handle = await getLocalFolderHandle(gameId);
    if (!handle) return undefined;

    const parts = normalizePath(path).split("/");
    const name = parts.pop();
    if (!name) return undefined;

    let dir = handle;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    const fileHandle = await dir.getFileHandle(name);
    return await fileHandle.getFile();
  } catch {
    return undefined;
  }
}

function isPlayerClient(client) {
  try {
    return new URL(client.url).pathname.startsWith("/play/");
  } catch {
    return false;
  }
}

function requestSessionFileFromClient(client, gameId, path) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.onmessage = null;
      resolve(undefined);
    }, SESSION_FILE_TIMEOUT_MS);

    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.onmessage = null;
      if (event.data && event.data.ok && event.data.file) {
        resolve(event.data.file);
        return;
      }
      resolve(undefined);
    };

    try {
      client.postMessage(
        {
          type: "session-file-request",
          gameId,
          path,
        },
        [channel.port2],
      );
    } catch {
      clearTimeout(timeout);
      channel.port1.onmessage = null;
      resolve(undefined);
    }
  });
}

async function getSessionFileBlob(gameId, path, requestClientId) {
  const clientsList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const appClients = clientsList.filter((client) => !isPlayerClient(client));
  const fallbackClients = clientsList.filter((client) =>
    isPlayerClient(client),
  );
  const orderedClients = [
    ...appClients.filter((client) => client.id === requestClientId),
    ...appClients.filter((client) => client.id !== requestClientId),
    ...fallbackClients,
  ];

  for (const client of orderedClients) {
    const blob = await requestSessionFileFromClient(client, gameId, path);
    if (blob) return blob;
  }
  return undefined;
}

async function getBlobForStoredRecord(gameId, record, requestClientId) {
  if (record.storageKind === "local-folder") {
    return getLocalFolderBlob(gameId, record.storageRef || record.path);
  }
  if (record.storageKind === "session-file") {
    return getSessionFileBlob(
      gameId,
      record.storageRef || record.path,
      requestClientId,
    );
  }
  if (record.storageKind === "opfs") {
    return getOpfsBlob(gameId, record.path);
  }
  return getIndexedDbBlob(record.storageRef);
}

function isMissingPluginMarkerPath(path) {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  const directory = index < 0 ? "" : normalized.slice(0, index);
  const filename = index < 0 ? normalized : normalized.slice(index + 1);
  return (
    (directory === "js/plugins" || directory === "www/js/plugins") &&
    filename.toLowerCase().endsWith(".js") &&
    filename.slice(0, -".js".length).trim().includes("■")
  );
}

function pathHasExtensionIgnoringSuffixMarkers(path, extension) {
  return pathWithoutSuffixMarkers(path).toLowerCase().endsWith(extension);
}

function isPlainImagePath(path) {
  const lowerPath = path.toLowerCase();
  return PLAIN_IMAGE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension));
}

function isPlainAudioPath(path) {
  const lowerPath = path.toLowerCase();
  return PLAIN_AUDIO_EXTENSIONS.some((extension) => lowerPath.endsWith(extension));
}

function plainMimeForPath(path) {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".png")) return "image/png";
  if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) return "image/jpeg";
  if (lowerPath.endsWith(".webp")) return "image/webp";
  if (lowerPath.endsWith(".gif")) return "image/gif";
  if (lowerPath.endsWith(".ogg")) return "audio/ogg";
  if (lowerPath.endsWith(".oga")) return "audio/ogg";
  if (lowerPath.endsWith(".m4a")) return "audio/mp4";
  if (lowerPath.endsWith(".mp3")) return "audio/mpeg";
  if (lowerPath.endsWith(".wav")) return "audio/wav";
  if (lowerPath.endsWith(".webm")) return "video/webm";
  if (lowerPath.endsWith(".mp4")) return "video/mp4";
  return undefined;
}

function isEncryptedImagePath(path) {
  const lowerPath = path.toLowerCase();
  return [".rpgmvp", ".png_", ".png__", ".png___"].some((extension) =>
    lowerPath.endsWith(extension),
  );
}

function isEncryptedAudioPath(path) {
  const lowerPath = path.toLowerCase();
  return (
    PLAIN_AUDIO_EXTENSIONS.some((extension) =>
      [extension + "_", extension + "__", extension + "___"].some((encryptedSuffix) =>
        lowerPath.endsWith(encryptedSuffix),
      ),
    ) ||
    pathHasExtensionIgnoringSuffixMarkers(lowerPath, ".rpgmvo") ||
    pathHasExtensionIgnoringSuffixMarkers(lowerPath, ".rpgmvm")
  );
}

function shouldEncryptPlainFallbackForEncryptedRequest(requestedPath, matchedPath) {
  return (
    (isEncryptedImagePath(requestedPath) && isPlainImagePath(matchedPath)) ||
    (isEncryptedAudioPath(requestedPath) && isPlainAudioPath(matchedPath))
  );
}

function plainRequestEncryptedFallbackMime(requestedPath, matchedPath) {
  if (isPlainImagePath(requestedPath) && isEncryptedImagePath(matchedPath)) {
    return plainMimeForPath(requestedPath);
  }
  if (isPlainAudioPath(requestedPath) && isEncryptedAudioPath(matchedPath)) {
    return plainMimeForPath(requestedPath);
  }
  return undefined;
}

function bytesStartWith(bytes, prefix) {
  if (!bytes || bytes.byteLength < prefix.byteLength) return false;
  for (let index = 0; index < prefix.byteLength; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  return true;
}

function imageMimeForBytes(bytes) {
  if (!bytes) return undefined;
  if (bytesStartWith(bytes, PNG_HEADER_BYTES)) return "image/png";
  if (bytesStartWith(bytes, JPEG_HEADER_BYTES)) return "image/jpeg";
  if (bytesStartWith(bytes, GIF87A_HEADER_BYTES) || bytesStartWith(bytes, GIF89A_HEADER_BYTES)) {
    return "image/gif";
  }
  if (
    bytes.byteLength >= 12 &&
    bytesStartWith(bytes, WEBP_RIFF_HEADER_BYTES) &&
    bytesStartWith(bytes.slice(8, 12), WEBP_WEBP_HEADER_BYTES)
  ) {
    return "image/webp";
  }
  return undefined;
}

function mediaMimeForBytes(bytes, fallbackMime) {
  const imageMime = imageMimeForBytes(bytes);
  if (imageMime) return imageMime;
  if (bytesStartWith(bytes, OGG_HEADER_BYTES)) return "audio/ogg";
  if (bytesStartWith(bytes, ID3_HEADER_BYTES)) return "audio/mpeg";
  if (bytes.byteLength >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (
    bytes.byteLength >= 12 &&
    bytesStartWith(bytes, RIFF_HEADER_BYTES) &&
    bytesStartWith(bytes.slice(8, 12), WAVE_HEADER_BYTES)
  ) {
    return "audio/wav";
  }
  if (bytesStartWith(bytes, EBML_HEADER_BYTES)) return "video/webm";
  if (bytes.byteLength >= 12 && bytesStartWith(bytes.slice(4, 8), FTYP_HEADER_BYTES)) {
    return fallbackMime === "audio/mp4" || fallbackMime === "video/mp4" ? fallbackMime : "video/mp4";
  }
  return fallbackMime;
}

function bytesFromHex(value) {
  const clean = String(value || "").trim();
  if (!/^[0-9a-fA-F]+$/u.test(clean) || clean.length % 2 !== 0) {
    return undefined;
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < clean.length; index += 2) {
    bytes[index / 2] = Number.parseInt(clean.slice(index, index + 2), 16);
  }
  return bytes;
}

async function readRpgMakerEncryptionKey(gameId, requestClientId) {
  for (const systemPath of ["www/data/System.json", "data/System.json"]) {
    const systemRecord = await getStoredFile(gameId, systemPath);
    if (!systemRecord) continue;

    const blob = await getBlobForStoredRecord(gameId, systemRecord, requestClientId);
    if (!blob) continue;

    try {
      const system = JSON.parse(await blob.text());
      const key = bytesFromHex(system?.encryptionKey);
      if (key && key.byteLength >= 16) return key.slice(0, 16);
    } catch {
      // Keep looking; some games omit or corrupt System.json encryption data.
    }
  }
  return null;
}

async function getRpgMakerEncryptionKey(gameId, requestClientId) {
  let promise = encryptionKeyCache.get(gameId);
  if (!promise) {
    promise = readRpgMakerEncryptionKey(gameId, requestClientId);
    encryptionKeyCache.set(gameId, promise);
  }
  return promise;
}

function encryptRpgMakerAsset(bytes, key) {
  const encrypted = new Uint8Array(RPG_MAKER_ENCRYPTED_HEADER_BYTES.byteLength + bytes.byteLength);
  encrypted.set(RPG_MAKER_ENCRYPTED_HEADER_BYTES, 0);
  encrypted.set(bytes, RPG_MAKER_ENCRYPTED_HEADER_BYTES.byteLength);
  const bodyOffset = RPG_MAKER_ENCRYPTED_HEADER_BYTES.byteLength;
  for (let index = 0; index < Math.min(16, bytes.byteLength, key.byteLength); index += 1) {
    encrypted[bodyOffset + index] = bytes[index] ^ key[index];
  }
  return encrypted;
}

function decryptRpgMakerAsset(bytes, key) {
  if (!bytesStartWith(bytes, RPG_MAKER_ENCRYPTED_HEADER_BYTES)) return undefined;
  const body = bytes.slice(RPG_MAKER_ENCRYPTED_HEADER_BYTES.byteLength);
  for (let index = 0; index < Math.min(16, body.byteLength, key.byteLength); index += 1) {
    body[index] ^= key[index];
  }
  return body;
}

function isExactAssetRequestMatch(match) {
  return normalizePath(match.requestedPath) === normalizePath(match.matchedPath);
}

function isTyranoConfigPath(path) {
  const normalized = normalizePath(path).toLowerCase();
  return normalized === "data/system/config.tjs" || normalized.endsWith("/data/system/config.tjs");
}

function isTyranoGame(files) {
  let hasRuntime = false;
  let hasConfig = false;

  for (const file of files) {
    const path = normalizePath(file.path).toLowerCase();
    hasRuntime ||= path === "tyrano/tyrano.js" || path.endsWith("/tyrano/tyrano.js");
    hasConfig ||= isTyranoConfigPath(path);
    if (hasRuntime && hasConfig) return true;
  }

  return false;
}

function adaptTyranoConfig(text) {
  return text.replace(
    /^(\s*;\s*configSave\s*=\s*)file(\s*(?:\/\/.*)?)$/gim,
    "$1webstorage$2",
  );
}

function isSteam4C2BridgePath(path) {
  const normalized = normalizePath(path).toLowerCase();
  return normalized === "steam4c2.js" || normalized.endsWith("/steam4c2.js");
}

function adaptSteam4C2Bridge(text) {
  return text.replace(
    /\bmodule\.exports\s*=\s*Steam4C2\s*;/gu,
    'if (typeof module !== "undefined" && module) module.exports = Steam4C2;',
  );
}

async function transformAssetBlobForRequest(gameId, match, blob, requestClientId) {
  if (isExactAssetRequestMatch(match)) {
    return { blob };
  }

  const shouldEncryptPlainFallback = shouldEncryptPlainFallbackForEncryptedRequest(
    match.requestedPath,
    match.matchedPath,
  );
  const decryptedMime = plainRequestEncryptedFallbackMime(
    match.requestedPath,
    match.matchedPath,
  );
  if (!shouldEncryptPlainFallback && !decryptedMime) {
    return { blob };
  }

  const key = await getRpgMakerEncryptionKey(gameId, requestClientId);
  if (!key) {
    return {
      error: new Response("RPG Maker encryption key not found", { status: 404 }),
    };
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (shouldEncryptPlainFallback) {
    return {
      blob: new Blob([encryptRpgMakerAsset(bytes, key)], {
        type: isEncryptedImagePath(match.requestedPath)
          ? "application/octet-stream"
          : blob.type,
      }),
      mime: isEncryptedImagePath(match.requestedPath)
        ? "application/octet-stream"
        : undefined,
    };
  }

  const decrypted = decryptRpgMakerAsset(bytes, key);
  if (!decrypted) {
    return {
      error: new Response("Encrypted RPG Maker asset fallback has an invalid header", {
        status: 404,
      }),
    };
  }
  const mime = mediaMimeForBytes(decrypted, decryptedMime);
  return {
    blob: new Blob([decrypted], { type: mime }),
    mime,
  };
}

async function serveGameFile(url, request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const gameId = decodeURIComponent(parts[1] || "");
  const requestedPath = normalizePath(
    parts.slice(2).map(decodeURIComponent).join("/"),
  );
  const game = gameId ? await getGame(gameId) : undefined;
  if (!game) return new Response("Game not found", { status: 404 });

  const path = requestedPath || game.entryPath || "index.html";
  const match = await getStoredFileMatch(gameId, path);
  if (!match) {
    if (path.endsWith(".map")) {
      return new Response(request.method === "HEAD" ? null : EMPTY_SOURCE_MAP_TEXT, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    if (isMissingPluginMarkerPath(path)) {
      return new Response(request.method === "HEAD" ? null : "", {
        status: 200,
        headers: {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    return new Response("File not found", { status: 404 });
  }

  const record = match.record;
  const blob = await getBlobForStoredRecord(gameId, record, request.clientId);
  if (!blob) {
    const message =
      record.storageKind === "session-file"
        ? "Folder session expired."
        : "File body not found";
    return new Response(message, { status: 404 });
  }

  const transformed = await transformAssetBlobForRequest(
    gameId,
    match,
    blob,
    request.clientId,
  );
  if (transformed.error) return transformed.error;
  const responseBlob = transformed.blob;
  const contentType =
    transformed.mime ||
    record.mime ||
    responseBlob.type ||
    blob.type ||
    "application/octet-stream";
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });

  if (request.method === "HEAD")
    return new Response(null, { status: 200, headers });

  if (isTyranoConfigPath(record.path)) {
    const files = await getGameFiles(gameId);
    if (isTyranoGame(files)) {
      const config = adaptTyranoConfig(await responseBlob.text());
      headers.set("Content-Type", "text/plain; charset=utf-8");
      return new Response(config, { status: 200, headers });
    }
  }

  if (isSteam4C2BridgePath(record.path)) {
    return new Response(adaptSteam4C2Bridge(await responseBlob.text()), {
      status: 200,
      headers,
    });
  }

  if ((record.mime || "").startsWith("text/html")) {
    const html = await responseBlob.text();
    const files = await getGameFiles(gameId);
    return new Response(injectBridge(html, game, files), {
      status: 200,
      headers,
    });
  }

  return new Response(responseBlob, { status: 200, headers });
}

function jsonForScript(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function encodedPath(path) {
  return normalizePath(path).split("/").map(encodeURIComponent).join("/");
}

function filenameFromPath(path) {
  const parts = normalizePath(path).split("/");
  return parts.at(-1) || path;
}

function desktopRuntimeConfig(game, files) {
  const gamePrefix = `/play/${encodeURIComponent(game.id)}/`;
  return {
    entryId: game.id,
    fileRoutePrefix: gamePrefix,
    files: files.map((file) => ({
      path: file.path,
      url: `${gamePrefix}${encodedPath(file.path)}`,
      size: file.size,
      mimeType: file.mime || "application/octet-stream",
      name: filenameFromPath(file.path),
    })),
  };
}

function injectBridge(html, game, files) {
  const bridgeConfig = `<script>window.__MZ_PLAYER_BRIDGE__=${jsonForScript({
    gameId: game.id,
    settings: game.settings,
  })};</script>`;
  const isTyrano = isTyranoGame(files);
  const desktopScripts = isTyrano ? "" : [
    `<script>window.__MZ_PLAYER_DESKTOP_CONFIG=${jsonForScript(
      desktopRuntimeConfig(game, files),
    )};</script>`,
    `<script src="/mz-player-runtime/buffer.js?v=${PLAYER_DESKTOP_RUNTIME_VERSION}"></script>`,
    `<script src="/mz-player-runtime/desktop.js?v=${PLAYER_DESKTOP_RUNTIME_VERSION}"></script>`,
  ].join("");
  const runtimeScripts = [
    desktopScripts,
    `<script src="/runtime-bridge.js?v=${PLAYER_BRIDGE_RUNTIME_VERSION}"></script>`,
  ].join("");
  const config = `${bridgeConfig}${runtimeScripts}`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${config}`);
  }
  return `${config}${html}`;
}
