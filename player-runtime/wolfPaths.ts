export function normalizeWolfPath(path: unknown): string {
  const parts = String(path).replaceAll("\\", "/").split("/");
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  return normalized.join("/");
}

function unicodeForms(path: string): string[] {
  return Array.from(new Set([
    path,
    path.normalize("NFC"),
    path.normalize("NFD"),
  ]));
}

export function wolfPathKeys(path: unknown): string[] {
  const keys = new Set<string>();
  for (const candidate of unicodeForms(normalizeWolfPath(path))) {
    const lower = candidate.toLowerCase();
    keys.add(lower);

    if (lower.startsWith("data/")) keys.add(candidate.slice(5).toLowerCase());

    const dataOffset = lower.lastIndexOf("/data/");
    if (dataOffset >= 0) keys.add(candidate.slice(dataOffset + 1).toLowerCase());
  }
  return Array.from(keys);
}
