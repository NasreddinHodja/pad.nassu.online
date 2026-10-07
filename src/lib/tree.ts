/** Every path under `base`, relative to it, with the ones only a deeper path implies. */
export function under(paths: string[], base: string) {
  const names = new Set<string>();
  for (const p of paths) {
    if (!p.startsWith(base + '/')) continue;
    const parts = p.slice(base.length + 1).split('/');
    for (let i = 1; i <= parts.length; i++) names.add(parts.slice(0, i).join('/'));
  }
  return [...names].sort();
}
