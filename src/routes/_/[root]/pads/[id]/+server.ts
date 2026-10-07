import { error, json } from '@sveltejs/kit';
import { ours, padIdParam, readCapped, rootParam, unlocked } from '#lib/server/api.ts';
import { rootOf } from '#lib/server/auth.ts';
import { deleteSealed, getSealed, migrateLegacy, putSealed } from '#lib/server/db.ts';
import { checkRate, MAX_SEALED, MAX_SEALED_NAME } from '#lib/server/limits.ts';
import type { RequestEvent, RequestHandler } from './$types';

function target(event: RequestEvent) {
  const root = rootParam(event.params.root);
  unlocked(event, root);
  return { root, id: padIdParam(event.params.id) };
}

export const GET: RequestHandler = (event) => {
  const { root, id } = target(event);
  const row = getSealed(root, id);
  return new Response(row ? new Uint8Array(row.data) : null, {
    status: row ? 200 : 204,
    headers: {
      'content-type': 'application/octet-stream',
      'cache-control': 'no-store',
      'x-updated-at': String(row?.updated_at ?? 0)
    }
  });
};

// The editor's autosave: the sealed text as the body, the sealed path in a
// header. Or a pad from before encryption, sealed: `x-pad-legacy` names its
// plain copy, deleted in the same transaction. Those skip the rate limit,
// since each needs a plain pad to use up and a root can have hundreds.
export const PUT: RequestHandler = async (event) => {
  ours(event);
  const { root, id } = target(event);
  const legacy = event.request.headers.get('x-pad-legacy');
  const legacyPath = legacy === null ? null : decodeHeader(legacy);
  if (legacyPath !== null && rootOf(legacyPath) !== root) error(400, 'not a pad of this root');
  if (legacyPath === null) checkRate(event.getClientAddress());
  const name = event.request.headers.get('x-pad-name') ?? '';
  if (!/^[A-Za-z0-9_-]+$/.test(name) || name.length > MAX_SEALED_NAME)
    error(400, 'malformed pad name');
  const data = await readCapped(event.request, MAX_SEALED);
  if (legacyPath === null) return json({ updatedAt: putSealed(root, id, name, data) });
  if (!migrateLegacy(root, id, name, data, legacyPath)) error(409, 'already encrypted');
  return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = (event) => {
  ours(event);
  const { root, id } = target(event);
  checkRate(event.getClientAddress());
  deleteSealed(root, id);
  return new Response(null, { status: 204 });
};

function decodeHeader(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    error(400, 'malformed pad path');
  }
}
