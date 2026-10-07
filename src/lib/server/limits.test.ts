import { describe, expect, test } from 'bun:test';
import { checkRate, MAX_DEPTH, MAX_PATH, MAX_SEGMENT, normalizePath } from './limits.ts';

describe('normalizePath', () => {
  test('drops empty segments', () => {
    expect(normalizePath('a//b/')).toBe('a/b');
    expect(normalizePath('/')).toBe('');
  });

  test('refuses the API, dot segments and control characters', () => {
    expect(normalizePath('_/a')).toBeNull();
    expect(normalizePath('a/../b')).toBeNull();
    expect(normalizePath('a/./b')).toBeNull();
    expect(normalizePath('a\u0000b')).toBeNull();
    expect(normalizePath('a\u007fb')).toBeNull();
  });

  test('keeps to the limits', () => {
    expect(normalizePath('a'.repeat(MAX_SEGMENT))).not.toBeNull();
    expect(normalizePath('a'.repeat(MAX_SEGMENT + 1))).toBeNull();
    expect(normalizePath(Array(MAX_DEPTH).fill('a').join('/'))).not.toBeNull();
    expect(
      normalizePath(
        Array(MAX_DEPTH + 1)
          .fill('a')
          .join('/')
      )
    ).toBeNull();
    const long = Array(5).fill('a'.repeat(MAX_SEGMENT)).join('/');
    expect(long.length).toBeGreaterThan(MAX_PATH);
    expect(normalizePath(long)).toBeNull();
  });
});

test('checkRate refuses the 61st write in a minute', () => {
  for (let i = 0; i < 60; i++) checkRate('rate-test');
  expect(() => checkRate('rate-test')).toThrow();
  checkRate('someone-else');
});
