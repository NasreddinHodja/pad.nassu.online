import { expect, test } from 'bun:test';
import { under } from './tree.ts';

test('every path under the base, relative, with the ones a deeper path implies', () => {
  expect(under(['a', 'a/b/c', 'a/d', 'ab/x', 'z'], 'a')).toEqual(['b', 'b/c', 'd']);
});
