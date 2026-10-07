// A pad and every pad under it, as a zip of org files: `notes` gives
// notes.org, notes/today.org, notes/today/later.org. Built in the browser,
// since only it can read them.

import * as api from './api';
import type { Keys } from './crypto';
import { zip } from './zip';

/** Sealed text an export takes at most; a full root could be 2.5 GiB. */
export const MAX_EXPORT = 64 * 1024 * 1024;
/** Pads fetched at once: enough to hide the round trips, few enough for the server. */
const PARALLEL = 4;

const MiB = (n: number) => `${Math.ceil(n / 1024 / 1024)} MiB`;
const utf8 = new TextEncoder();

export type Pad = { path: string; text: string };

/** The pad and every pad under it, by path; refused past MAX_EXPORT before fetching any. */
export async function collect(
  root: string,
  keys: Keys,
  path: string,
  progress: (done: number, total: number) => void
) {
  const pads = (await api.sizes(root, keys)).filter(
    (p) => p.path === path || p.path.startsWith(path + '/')
  );
  const total = pads.reduce((n, p) => n + p.size, 0);
  if (total > MAX_EXPORT)
    throw new Error(
      `/${path} and its pads come to ${MiB(total)}, over the ${MiB(MAX_EXPORT)} an export takes`
    );

  const out: Pad[] = [];
  let next = 0;
  progress(0, pads.length);
  async function worker() {
    while (next < pads.length) {
      const pad = pads[next++];
      out.push({ path: pad.path, text: await api.load(root, keys, pad.path) });
      progress(out.length, pads.length);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export async function exportPads(
  root: string,
  keys: Keys,
  path: string,
  progress: (done: number, total: number) => void
) {
  const pads = await collect(root, keys, path, progress);
  if (!pads.length) throw new Error('nothing to export: the pad is empty');
  const base = path.split('/').at(-1)!;
  return zip(
    pads.map((p) => ({
      name: base + p.path.slice(path.length) + '.org',
      data: utf8.encode(p.text)
    }))
  );
}

/** Hands the browser a file to save. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
