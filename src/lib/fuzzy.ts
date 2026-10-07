export type Match = { item: string; score: number; hits: number[] };

const BOUNDARY = '/-_ .';

/**
 * fzf-ish: every character of the query, in order, case-insensitive. Runs of
 * consecutive hits and hits at the start of a word score higher; shorter items
 * win ties. Null if it doesn't match.
 */
export function fuzzy(item: string, query: string): Match | null {
	const hay = item.toLowerCase();
	const needle = query.toLowerCase();
	const hits: number[] = [];
	let score = 0;
	let from = 0;
	for (const ch of needle) {
		const i = hay.indexOf(ch, from);
		if (i === -1) return null;
		score += 1;
		if (hits.length && i === hits[hits.length - 1] + 1) score += 3;
		if (i === 0 || BOUNDARY.includes(hay[i - 1])) score += 2;
		hits.push(i);
		from = i + 1;
	}
	return { item, score: score - item.length / 100, hits };
}

/** Best first. An empty query keeps every item, shallowest first. */
export function rank(items: string[], query: string): Match[] {
	if (!query) {
		return items
			.map((item) => ({ item, score: 0, hits: [] }))
			.sort(
				(a, b) =>
					a.item.split('/').length - b.item.split('/').length || a.item.localeCompare(b.item)
			);
	}
	const out: Match[] = [];
	for (const item of items) {
		const m = fuzzy(item, query);
		if (m) out.push(m);
	}
	return out.sort((a, b) => b.score - a.score || a.item.localeCompare(b.item));
}
