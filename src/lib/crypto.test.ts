import { expect, test } from 'bun:test';
import {
  checkPassword,
  fromBase64,
  fromPassword,
  openName,
  openRootKey,
  openShare,
  openShareKey,
  openSnapshot,
  openText,
  padId,
  padKeys,
  random,
  sealName,
  sealRootKey,
  sealShare,
  sealShareKey,
  sealSnapshot,
  sealText,
  toBase64
} from './crypto.ts';

test('base64url round-trips without padding', () => {
  const bytes = random(31);
  const text = toBase64(bytes);
  expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(fromBase64(text)).toEqual(bytes);
});

test('passwords are counted in characters', () => {
  expect(checkPassword('1234567')).not.toBeNull();
  expect(checkPassword('12345678')).toBeNull();
  expect(checkPassword('ééééééé')).not.toBeNull();
});

test('the root key opens only with its password, for its root', async () => {
  const salt = random(16);
  const rootKey = random(32);
  const { wrap, auth } = await fromPassword('correct horse', salt);
  const sealed = await sealRootKey(wrap, rootKey, 'a');
  expect(await openRootKey(wrap, sealed, 'a')).toEqual(rootKey);
  expect(await openRootKey(wrap, sealed, 'b')).toBeNull();
  const wrong = await fromPassword('wrong horse', salt);
  expect(await openRootKey(wrong.wrap, sealed, 'a')).toBeNull();
  expect(wrong.auth).not.toEqual(auth);
});

test('text and names open only under the id they were sealed for', async () => {
  const keys = await padKeys(random(32));
  const id = await padId(keys, 'a/b');
  expect(await padId(keys, 'a/b')).toBe(id);
  const other = await padId(keys, 'a/c');
  expect(other).not.toBe(id);

  const text = await sealText(keys, id, 'hello');
  expect(await openText(keys, id, text)).toBe('hello');
  await expect(openText(keys, other, text)).rejects.toThrow();

  const name = await sealName(keys, id, 'a/b');
  expect(await openName(keys, id, name)).toBe('a/b');
  await expect(openName(keys, other, name)).rejects.toThrow();
});

test("a link's copy opens with its key, for its id, and its key with the root's", async () => {
  const keys = await padKeys(random(32));
  const key = random(32);
  const snapshot = { path: 'a/b', text: 'first line\nsecond line' };
  const sealed = await sealSnapshot(key, 'link', snapshot);
  expect(await openSnapshot(key, 'link', sealed)).toEqual(snapshot);
  await expect(openSnapshot(random(32), 'link', sealed)).rejects.toThrow();
  await expect(openSnapshot(key, 'other', sealed)).rejects.toThrow();
  expect(await openShareKey(keys, 'link', await sealShareKey(keys, 'link', key))).toEqual(key);
});

test("a link's pads open with its key, for its id, and never as a link from before", async () => {
  const key = random(32);
  const plain = new TextEncoder().encode('{"path":"a","pads":[]}');
  const sealed = await sealShare(key, 'link', plain);
  expect(await openShare(key, 'link', sealed)).toEqual(plain);
  await expect(openShare(key, 'other', sealed)).rejects.toThrow();
  await expect(openSnapshot(key, 'link', sealed)).rejects.toThrow();
});
