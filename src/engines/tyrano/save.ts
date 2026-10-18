import { normalizeStoredPath } from "@/src/lib/paths";

export function tyranoLocalStorageEntryForImport(
  path: string,
  text: string,
): { key: string; value: string } | undefined {
  const filename = normalizeStoredPath(path).split("/").at(-1);
  if (!filename?.toLowerCase().endsWith(".sav")) return undefined;
  const key = filename.slice(0, -".sav".length);
  const normalizedText = text.replace(/^\uFEFF/u, "").trim();

  try {
    if (/^%(?:7b|5b)/iu.test(normalizedText)) {
      JSON.parse(legacyUnescape(normalizedText));
      return { key, value: normalizedText };
    }
    JSON.parse(normalizedText);
    return { key, value: legacyEscape(normalizedText) };
  } catch {
    throw new Error(`Invalid TyranoScript save file: ${filename}`);
  }
}

function legacyEscape(value: string): string {
  const escapeValue = (
    globalThis as typeof globalThis & {
      escape?: (input: string) => string;
    }
  ).escape;
  return escapeValue ? escapeValue(value) : encodeURIComponent(value);
}

function legacyUnescape(value: string): string {
  const unescapeValue = (
    globalThis as typeof globalThis & {
      unescape?: (input: string) => string;
    }
  ).unescape;
  return unescapeValue ? unescapeValue(value) : decodeURIComponent(value);
}
