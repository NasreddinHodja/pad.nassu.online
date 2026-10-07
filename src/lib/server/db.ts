import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// PAD_DB is /config/pad.db in the Docker image; ./data/pad.db in dev.
const file = process.env.PAD_DB ?? 'data/pad.db';
mkdirSync(dirname(file), { recursive: true });

export const db = new Database(file, { strict: true });
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');
db.run(`CREATE TABLE IF NOT EXISTS pads (
	path TEXT PRIMARY KEY,
	content TEXT NOT NULL,
	updated_at INTEGER NOT NULL
) WITHOUT ROWID`);

const getStmt = db.query<{ content: string; updated_at: number }, [string]>(
	'SELECT content, updated_at FROM pads WHERE path = ?'
);
const putStmt = db.query(
	`INSERT INTO pads (path, content, updated_at) VALUES (?1, ?2, ?3)
	 ON CONFLICT(path) DO UPDATE SET content = ?2, updated_at = ?3`
);
const deleteStmt = db.query('DELETE FROM pads WHERE path = ?');
// Every pad under `a/`: '0' is the character after '/', so the range is
// exactly the paths starting with `a/`, and it walks the primary key.
const underStmt = db.query<{ path: string }, [string, string]>(
	'SELECT path FROM pads WHERE path > ? AND path < ? ORDER BY path LIMIT 2000'
);

export function getPad(path: string) {
	const row = getStmt.get(path);
	return { content: row?.content ?? '', updatedAt: row?.updated_at ?? null };
}

/** Last write wins. An empty pad is deleted, so it drops out of its parent's list. */
export function putPad(path: string, content: string) {
	const now = Date.now();
	if (content === '') deleteStmt.run(path);
	else putStmt.run(path, content, now);
	return now;
}

/**
 * Every pad under `path`, relative to it (`b`, `b/c`), including ones that
 * only exist as a prefix of a deeper pad.
 */
export function subpads(path: string) {
	const names = new Set<string>();
	for (const row of underStmt.all(path + '/', path + '0')) {
		const parts = row.path.slice(path.length + 1).split('/');
		for (let i = 1; i <= parts.length; i++) names.add(parts.slice(0, i).join('/'));
	}
	return [...names];
}
