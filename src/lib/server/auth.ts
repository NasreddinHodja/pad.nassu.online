// Root pads and their passwords.
//
// The first segment of a path is its root: `/a/b/c` belongs to `a`. Whoever
// first saves under a root sets its password, and from then on reading or
// writing anything under it needs that password. Root pads saved before this
// existed have none, and the next person to edit one claims it.
//
// Unlocking gives the browser one opaque token in an HttpOnly cookie; the
// database keeps only its SHA-256, per root it unlocks, so a copy of the file
// opens nothing. Passwords are Argon2id with OWASP's minimum parameters, as
// in konigslibrary.

import { dev } from '$app/env';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.ts';

export const MIN_PASSWORD = 8;
/** Bounds the work one request can ask for. */
export const MAX_PASSWORD = 256;

const DAY = 24 * 60 * 60 * 1000;
/** An unlock unused this long, or this old, is over. */
const IDLE = 30 * DAY;
const ABSOLUTE = 180 * DAY;
/** last_seen is written at most this often. */
const TOUCH_EVERY = 60 * 60 * 1000;

// __Host-: only this host, over https, on every path. Dev runs on plain http.
const COOKIE = dev ? 'pad' : '__Host-pad';

const ARGON2 = { algorithm: 'argon2id', memoryCost: 19 * 1024, timeCost: 2 } as const;

db.run(`CREATE TABLE IF NOT EXISTS roots (
	name TEXT PRIMARY KEY,
	password_hash TEXT NOT NULL,
	created_at INTEGER NOT NULL
) WITHOUT ROWID`);
db.run(`CREATE TABLE IF NOT EXISTS unlocks (
	token_hash BLOB NOT NULL,
	root TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	last_seen INTEGER NOT NULL,
	PRIMARY KEY (token_hash, root)
) WITHOUT ROWID`);
db.run('CREATE INDEX IF NOT EXISTS unlocks_by_root ON unlocks (root)');

const hashStmt = db.query<{ password_hash: string }, [string]>(
	'SELECT password_hash FROM roots WHERE name = ?'
);
const claimStmt = db.query(
	'INSERT OR IGNORE INTO roots (name, password_hash, created_at) VALUES (?, ?, ?)'
);
const setHashStmt = db.query('UPDATE roots SET password_hash = ? WHERE name = ?');
const unlockedStmt = db.query<{ last_seen: number }, [Uint8Array, string, number]>(
	`SELECT last_seen FROM unlocks
	 WHERE token_hash = ?1 AND root = ?2 AND last_seen > ?3 - ${IDLE} AND created_at > ?3 - ${ABSOLUTE}`
);
const touchStmt = db.query('UPDATE unlocks SET last_seen = ? WHERE token_hash = ? AND root = ?');
const moveStmt = db.query('UPDATE OR REPLACE unlocks SET token_hash = ? WHERE token_hash = ?');
const addStmt = db.query(
	`INSERT OR REPLACE INTO unlocks (token_hash, root, created_at, last_seen) VALUES (?1, ?2, ?3, ?3)`
);
const removeStmt = db.query('DELETE FROM unlocks WHERE token_hash = ? AND root = ?');
const revokeOthersStmt = db.query('DELETE FROM unlocks WHERE root = ? AND token_hash != ?');
const expireStmt = db.query(
	`DELETE FROM unlocks WHERE last_seen <= ?1 - ${IDLE} OR created_at <= ?1 - ${ABSOLUTE}`
);

export const rootOf = (path: string) => path.split('/')[0];

const tokenHash = (token: string) => createHash('sha256').update(token).digest();

/** Why a new password can't be used, if it can't. Counted in characters. */
export function checkPassword(password: string) {
	const length = [...password].length;
	if (length < MIN_PASSWORD) return `the password needs at least ${MIN_PASSWORD} characters`;
	if (length > MAX_PASSWORD) return `the password can have at most ${MAX_PASSWORD} characters`;
	return null;
}

export function isClaimed(root: string) {
	return hashStmt.get(root) !== null;
}

/** Sets the root's password unless someone already has. */
export async function claim(root: string, password: string) {
	const hash = await Bun.password.hash(password, ARGON2);
	return claimStmt.run(root, hash, Date.now()).changes === 1;
}

export async function verify(root: string, password: string) {
	const hash = hashStmt.get(root)?.password_hash;
	if (!hash || password.length > MAX_PASSWORD * 4) return false;
	return Bun.password.verify(password, hash);
}

export async function setPassword(root: string, password: string, keep: Cookies) {
	setHashStmt.run(await Bun.password.hash(password, ARGON2), root);
	revokeOthersStmt.run(root, tokenHash(keep.get(COOKIE) ?? ''));
}

export type Access = 'open' | 'unlocked' | 'locked';

/** Open: no one has claimed the root yet. */
export function access(cookies: Cookies, root: string): Access {
	if (!isClaimed(root)) return 'open';
	const token = cookies.get(COOKIE);
	if (!token) return 'locked';
	const now = Date.now();
	const hash = tokenHash(token);
	const row = unlockedStmt.get(hash, root, now);
	if (!row) return 'locked';
	if (now - row.last_seen > TOUCH_EVERY) touchStmt.run(now, hash, root);
	return 'unlocked';
}

/**
 * Unlocks `root` for this browser. The token is new every time, carrying over
 * the roots the old one had, so one planted before the unlock is worth nothing.
 */
export function unlock(cookies: Cookies, root: string) {
	const now = Date.now();
	expireStmt.run(now);
	const token = randomBytes(32).toString('base64url');
	const hash = tokenHash(token);
	const old = cookies.get(COOKIE);
	if (old) moveStmt.run(hash, tokenHash(old));
	addStmt.run(hash, root, now);
	cookies.set(COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: ABSOLUTE / 1000
	});
}

/** Forgets `root` on this browser. */
export function lock(cookies: Cookies, root: string) {
	const token = cookies.get(COOKIE);
	if (token) removeStmt.run(tokenHash(token), root);
}

/**
 * Whether a write carrying our cookie was sent by our own page. SameSite
 * keeps other sites' requests from carrying it, but not other nassu.online
 * subdomains': they're the same site. `Sec-Fetch-Site` is set by the browser;
 * browsers too old to send it are judged by `Origin`.
 */
export function sameOrigin({ request, url }: RequestEvent) {
	const site = request.headers.get('sec-fetch-site');
	if (site) return site === 'same-origin';
	return request.headers.get('origin') === url.origin;
}

// Failed unlocks back off, per address and per root, as konigslibrary's do: a
// few free, then a wait that doubles up to 15 minutes. In memory: a restart
// forgets the counts, which costs an attacker a restart they can't cause.
const FREE = 5;
const MAX_WAIT = 15 * 60 * 1000;
const MAX_ENTRIES = 10_000;
const FORGET_AFTER = 60 * 60 * 1000;
const failures = new Map<string, { count: number; until: number; last: number }>();

/** Milliseconds `keys` must still wait before another try, if any. */
export function owedWait(keys: string[]) {
	const now = Date.now();
	const until = Math.max(0, ...keys.map((k) => failures.get(k)?.until ?? 0));
	return until > now ? until - now : 0;
}

export function failed(keys: string[]) {
	const now = Date.now();
	for (const key of keys) {
		if (failures.size >= MAX_ENTRIES && !failures.has(key)) {
			for (const [k, e] of failures) if (now - e.last > FORGET_AFTER) failures.delete(k);
			// A flood of fresh keys: dropping them all only frees their own counts.
			if (failures.size >= MAX_ENTRIES) failures.clear();
		}
		const entry = failures.get(key) ?? { count: 0, until: now, last: now };
		entry.count++;
		entry.until =
			entry.count < FREE
				? now
				: now + Math.min(1000 * 2 ** Math.min(entry.count - FREE, 20), MAX_WAIT);
		entry.last = now;
		failures.set(key, entry);
	}
}

export function succeeded(keys: string[]) {
	for (const key of keys) failures.delete(key);
}
