import { expect, test } from 'bun:test';
import { fuzzy, rank } from './fuzzy.ts';

test('matches the query in order, case-insensitively', () => {
	expect(fuzzy('Notes/Today', 'nt')?.hits).toEqual([0, 2]);
	expect(fuzzy('notes', 'sn')).toBeNull();
});

test('ranks word starts and runs first', () => {
	expect(rank(['backlog', 'blog'], 'blo').map((m) => m.item)).toEqual(['blog', 'backlog']);
});

test('an empty query lists every item, shallowest first', () => {
	expect(rank(['b/c', 'b', 'a/b/c', 'a'], '').map((m) => m.item)).toEqual([
		'a',
		'b',
		'b/c',
		'a/b/c'
	]);
});
