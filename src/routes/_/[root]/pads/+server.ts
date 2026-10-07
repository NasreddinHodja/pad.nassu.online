import { error, json } from '@sveltejs/kit';
import { body, ours, rootParam, unlocked } from '#lib/server/api.ts';
import { rootOf } from '#lib/server/auth.ts';
import { dropLegacy, legacyPads, listSealed } from '#lib/server/db.ts';
import type { RequestHandler } from './$types';

// Every pad of the root, sealed, for the browser to list; and the ones from
// before encryption, for it to encrypt.
export const GET: RequestHandler = (event) => {
  const root = rootParam(event.params.root);
  unlocked(event, root);
  return json(
    { pads: listSealed(root), legacy: legacyPads(root) },
    { headers: { 'cache-control': 'no-store' } }
  );
};

// The plain text of pads the browser has encrypted.
export const DELETE: RequestHandler = async (event) => {
  ours(event);
  const root = rootParam(event.params.root);
  unlocked(event, root);
  const { paths } = await body(event.request);
  if (!Array.isArray(paths) || !paths.every((p) => typeof p === 'string' && rootOf(p) === root))
    error(400, 'malformed body');
  dropLegacy(paths);
  return new Response(null, { status: 204 });
};
