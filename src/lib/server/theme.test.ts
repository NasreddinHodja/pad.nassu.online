import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { claim } from './auth.ts';
import { getTheme, setTheme } from './theme.ts';
import { deleteRoot, purgeRoot } from './trash.ts';

const bytes = (n: number) => new Uint8Array(randomBytes(n));

test("a root's theme is kept until the root is purged", () => {
  claim('themed', bytes(16), bytes(32), bytes(60));
  expect(getTheme('themed')).toBeNull();
  const sealed = bytes(73);
  setTheme('themed', sealed);
  expect(getTheme('themed')).toEqual(sealed);
  deleteRoot('themed');
  purgeRoot('themed');
  expect(getTheme('themed')).toBeNull();
});
