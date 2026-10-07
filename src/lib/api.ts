// The browser's side of `/_/…`: everything sent is sealed first.

import {
  fromBase64,
  fromPassword,
  openName,
  openRootKey,
  openText,
  padId,
  padKeys,
  random,
  sealName,
  sealRootKey,
  sealText,
  toBase64,
  type Keys
} from './crypto';

const base = (root: string) => '/_/' + encodeURIComponent(root);

async function call(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const message = (await res.json().catch(() => null))?.message;
    throw new Error(message ?? `request failed (${res.status})`);
  }
  return res;
}

const post = (url: string, data: unknown) =>
  call(url, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'content-type': 'application/json' }
  });

/** A fresh salt, and the root key sealed under the password it gives. */
async function seal(password: string, root: string, rootKey: Uint8Array<ArrayBuffer>) {
  const salt = random(16);
  const { auth, wrap } = await fromPassword(password, salt);
  return {
    salt: toBase64(salt),
    auth: toBase64(auth),
    sealedKey: toBase64(await sealRootKey(wrap, rootKey, root))
  };
}

export async function claim(root: string, password: string) {
  const rootKey = random(32);
  await post(`${base(root)}/auth/claim`, await seal(password, root, rootKey));
  return padKeys(rootKey);
}

/** The root key, after checking the password with the server. */
async function rootKey(root: string, password: string, salt: string) {
  const { auth, wrap } = await fromPassword(password, fromBase64(salt));
  const res = await post(`${base(root)}/auth/unlock`, { auth: toBase64(auth) });
  const key = await openRootKey(wrap, fromBase64((await res.json()).sealedKey), root);
  // The server said yes to a password its own sealed key doesn't open under.
  if (!key) throw new Error("the server's copy of the key doesn't match, refusing it");
  return { key, auth };
}

export async function unlock(root: string, password: string, salt: string) {
  return padKeys((await rootKey(root, password, salt)).key);
}

/** The same root key, sealed under the new password: no pad changes. */
export async function changePassword(root: string, current: string, next: string, salt: string) {
  const { key, auth } = await rootKey(root, current, salt);
  await post(`${base(root)}/auth/password`, {
    current: toBase64(auth),
    ...(await seal(next, root, key))
  });
}

export const lock = (root: string) => post(`${base(root)}/auth/lock`, {});

/**
 * Every pad path in the root. Pads from before encryption get encrypted on
 * the way, and their plain text deleted from the server.
 */
export async function list(root: string, keys: Keys) {
  const { pads, legacy } = (await (await call(`${base(root)}/pads`)).json()) as {
    pads: { id: string; name: string }[];
    legacy: { path: string; content: string }[];
  };
  const paths = await Promise.all(pads.map((p) => openName(keys, p.id, p.name)));
  // Sealed by an earlier, interrupted run: only the plain copy is left to delete.
  const done = legacy.filter((p) => paths.includes(p.path)).map((p) => p.path);
  for (const { path, content } of legacy) {
    if (done.includes(path)) continue;
    await save(root, keys, path, content, path);
    paths.push(path);
  }
  if (done.length)
    await call(`${base(root)}/pads`, {
      method: 'DELETE',
      body: JSON.stringify({ paths: done }),
      headers: { 'content-type': 'application/json' }
    });
  return [...new Set(paths)];
}

export async function load(root: string, keys: Keys, path: string) {
  const id = await padId(keys, path);
  const res = await call(`${base(root)}/pads/${id}`);
  if (res.status === 204) return '';
  return openText(keys, id, new Uint8Array(await res.arrayBuffer()));
}

/** An empty pad is deleted. `legacy`: the plain pad this replaces. */
export async function save(root: string, keys: Keys, path: string, text: string, legacy?: string) {
  const id = await padId(keys, path);
  const url = `${base(root)}/pads/${id}`;
  if (text === '') return call(url, { method: 'DELETE' });
  return call(url, {
    method: 'PUT',
    body: await sealText(keys, id, text),
    headers: {
      'content-type': 'application/octet-stream',
      'x-pad-name': await sealName(keys, id, path),
      ...(legacy !== undefined && { 'x-pad-legacy': encodeURIComponent(legacy) })
    }
  });
}
