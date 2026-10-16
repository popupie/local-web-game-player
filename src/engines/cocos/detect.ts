export function isCocosGame(paths: string[]): boolean {
  return paths.some(
    (path) =>
      path === "application.js" ||
      path.endsWith("/application.js") ||
      path.includes("cocos-js/"),
  );
}
