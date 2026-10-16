export function isRpgMakerGame(paths: string[]): boolean {
  const filenames = ["js/rpg_core.js", "js/rmmz_core.js", "data/system.json"];
  return paths.some((path) =>
    filenames.some((name) => path === name || path.endsWith(`/${name}`)),
  );
}
