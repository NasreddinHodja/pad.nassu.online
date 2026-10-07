import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// PAD_DB is /config/pad.db in the Docker image; ./data/pad.db in dev.
const file = process.env.PAD_DB ?? 'data/pad.db';
mkdirSync(dirname(file), { recursive: true });

export const db = new Database(file, { strict: true });
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');
// Pads from before encryption, in plain text. The first browser to unlock
// their root encrypts them into `sealed` and deletes them from here.
db.run(`CREATE TABLE IF NOT EXISTS pads (
	path TEXT PRIMARY KEY,
	content TEXT NOT NULL,
	updated_at INTEGER NOT NULL
) WITHOUT ROWID`);
// `id` is the HMAC of the pad's path under the root's key; `name` is the path
// and `data` the text, both sealed by the browser. The server can tell how
// many pads a root has and how long each is, nothing more.
db.run(`CREATE TABLE IF NOT EXISTS sealed (
	root TEXT NOT NULL,
	id TEXT NOT NULL,
	name TEXT NOT NULL,
	data BLOB NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (root, id)
) WITHOUT ROWID`);

const getStmt = db.query<{ data: Uint8Array; updated_at: number }, [string, string]>(
	'SELECT data, updated_at FROM sealed WHERE root = ? AND id = ?'
);
const putStmt = db.query(
	`INSERT INTO sealed (root, id, name, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
	 ON CONFLICT(root, id) DO UPDATE SET name = ?3, data = ?4, updated_at = ?5`
);
const deleteStmt = db.query('DELETE FROM sealed WHERE root = ? AND id = ?');
const listStmt = db.query<{ id: string; name: string }, [string]>(
	'SELECT id, name FROM sealed WHERE root = ? ORDER BY id LIMIT 5000'
);
// The root's own pad and every one under `root/`: '0' is the character after
// '/', so the range is exactly the paths starting with `root/`.
const legacyStmt = db.query<{ path: string; content: string }, [string, string, string]>(
	'SELECT path, content FROM pads WHERE path = ?1 OR (path > ?2 AND path < ?3)'
);
const dropLegacyStmt = db.query('DELETE FROM pads WHERE path = ?');

export function getSealed(root: string, id: string) {
	return getStmt.get(root, id);
}

/** Last write wins. */
export function putSealed(root: string, id: string, name: string, data: Uint8Array) {
	const now = Date.now();
	putStmt.run(root, id, name, data, now);
	return now;
}

/** An empty pad is deleted, so it drops out of its parent's list. */
export function deleteSealed(root: string, id: string) {
	deleteStmt.run(root, id);
}

export function listSealed(root: string) {
	return listStmt.all(root);
}

export function legacyPads(root: string) {
	return legacyStmt.all(root, root + '/', root + '0');
}

/**
 * Swaps a pad from before encryption for its sealed copy. False if there was
 * no such plain pad, so each migration uses one up.
 */
export const migrateLegacy = db.transaction(
	(root: string, id: string, name: string, data: Uint8Array, path: string) => {
		if (dropLegacyStmt.run(path).changes !== 1) return false;
		putSealed(root, id, name, data);
		return true;
	}
);

/** Only the paths the browser encrypted: nothing else is lost. */
export const dropLegacy = db.transaction((paths: string[]) => {
	for (const path of paths) dropLegacyStmt.run(path);
});
