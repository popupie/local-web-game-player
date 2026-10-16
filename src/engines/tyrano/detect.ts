export function isTyranoGame(paths: string[]): boolean {
  return paths.some(
    (path) =>
      path === "tyrano/tyrano.js" ||
      path.endsWith("/tyrano/tyrano.js") ||
      path === "data/system/config.tjs" ||
      path.endsWith("/data/system/config.tjs"),
  );
}
