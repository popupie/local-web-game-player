export function isConstruct2Game(paths: string[]): boolean {
  return paths.some(
    (path) => path === "c2runtime.js" || path.endsWith("/c2runtime.js"),
  );
}
