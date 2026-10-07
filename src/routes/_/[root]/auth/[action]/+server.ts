import { error, json } from '@sveltejs/kit';
import { body, bytes, ours, rootParam, unlocked } from '#lib/server/api.ts';
import {
  attemptKeys,
  AUTH_BYTES,
  claim,
  failed,
  lock,
  owedWait,
  rememberDevice,
  SALT_BYTES,
  SEALED_KEY_BYTES,
  setPassword,
  succeeded,
  unlock,
  verify
} from '#lib/server/auth.ts';
import { checkRate } from '#lib/server/limits.ts';
import type { RequestEvent, RequestHandler } from './$types';

/**
 * The sealed root key if `auth` is right, backing off repeated misses: a
 * browser that has unlocked the root before on its own misses, any other on
 * its address's.
 */
function attempt(event: RequestEvent, root: string, auth: Uint8Array) {
  const keys = attemptKeys(event.cookies, root, event.getClientAddress());
  const wait = owedWait(keys);
  if (wait) error(429, `too many wrong passwords, wait ${Math.ceil(wait / 1000)}s`);
  const sealedKey = verify(root, auth);
  if (!sealedKey) {
    failed(keys);
    error(401, 'wrong password');
  }
  succeeded(keys);
  rememberDevice(event.cookies, root);
  return sealedKey;
}

function newPassword(data: Record<string, unknown>) {
  return {
    salt: bytes(data.salt, SALT_BYTES),
    auth: bytes(data.auth, AUTH_BYTES),
    sealedKey: bytes(data.sealedKey, SEALED_KEY_BYTES)
  };
}

export const POST: RequestHandler = async (event) => {
  ours(event);
  const root = rootParam(event.params.root);
  checkRate(event.getClientAddress());
  const { cookies } = event;

  switch (event.params.action) {
    case 'claim': {
      const next = newPassword(await body(event.request));
      if (!claim(root, next.salt, next.auth, next.sealedKey))
        error(409, `someone just claimed /${root}, ask them for the password`);
      unlock(cookies, root);
      rememberDevice(cookies, root);
      return new Response(null, { status: 204 });
    }

    case 'unlock': {
      const sealedKey = attempt(event, root, bytes((await body(event.request)).auth, AUTH_BYTES));
      unlock(cookies, root);
      return json({ sealedKey: Buffer.from(sealedKey).toString('base64url') });
    }

    // Signs every other browser out of the root.
    case 'password': {
      unlocked(event, root);
      const data = await body(event.request);
      const next = newPassword(data);
      attempt(event, root, bytes(data.current, AUTH_BYTES));
      setPassword(root, next, cookies);
      return new Response(null, { status: 204 });
    }

    case 'lock':
      lock(cookies, root);
      return new Response(null, { status: 204 });
  }
  error(404, 'no such action');
};
