import { error, json } from '@sveltejs/kit';
import {
  bytes,
  ours,
  padIdParam,
  readCapped,
  rootParam,
  shareIdParam,
  unlocked
} from '#lib/server/api.ts';
import { SEALED_KEY_BYTES } from '#lib/server/auth.ts';
import { MAX_SHARE } from '#lib/limits.ts';
import { checkRate } from '#lib/server/limits.ts';
import {
  addShare,
  getShare,
  MAX_SHARE_BYTES,
  MAX_SHARES,
  removeShare
} from '#lib/server/shares.ts';
import type { RequestHandler } from './$types';

// A read-only link's copy, for anyone with the link: without the key after
// its `#` it's noise.
export const GET: RequestHandler = ({ params }) => {
  const row = getShare(rootParam(params.root), shareIdParam(params.share));
  if (!row) error(404, 'this link was revoked, or never was');
  return new Response(new Uint8Array(row.data), {
    headers: {
      'content-type': 'application/octet-stream',
      'cache-control': 'no-store',
      'x-created-at': String(row.created_at)
    }
  });
};

// A new link: the sealed copy as the body, the pad's id and the link's key
// sealed under the root's in headers.
export const PUT: RequestHandler = async (event) => {
  ours(event);
  const root = rootParam(event.params.root);
  unlocked(event, root);
  checkRate(event.getClientAddress());
  const id = shareIdParam(event.params.share);
  const pad = padIdParam(event.request.headers.get('x-pad-id') ?? '');
  const sealedKey = bytes(event.request.headers.get('x-share-key'), SEALED_KEY_BYTES);
  const made = addShare(
    root,
    id,
    pad,
    sealedKey,
    await readCapped(event.request, MAX_SHARE, 'the link is over 1 MiB')
  );
  if (made === 'full')
    error(
      409,
      `/${root}'s links are at ${MAX_SHARES} or ${MAX_SHARE_BYTES / 1024 / 1024} MiB, revoke some first`
    );
  if (made === 'taken') error(409, 'that link id is taken, try again');
  return json({ createdAt: made });
};

export const DELETE: RequestHandler = (event) => {
  ours(event);
  const root = rootParam(event.params.root);
  unlocked(event, root);
  removeShare(root, shareIdParam(event.params.share));
  return new Response(null, { status: 204 });
};
