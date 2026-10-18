export function isWolfGame(paths: string[]): boolean {
  const hasPath = (name: string) =>
    paths.some((path) => path === name || path.endsWith(`/${name}`));
  return (
    hasPath("woditor.js") &&
    hasPath("woditor.wasm") &&
    (hasPath("data.wolf") || hasPath("asset_manifest.json"))
  );
}
