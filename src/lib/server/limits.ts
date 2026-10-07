import { error } from '@sveltejs/kit';

export const MAX_BYTES = 512 * 1024;
export const MAX_PATH = 255;
export const MAX_SEGMENT = 64;
export const MAX_DEPTH = 10;

// Writes per IP per minute. Autosave fires once per pause in typing, so a
// person never gets near this; a script filling the disk does.
const WRITES_PER_MINUTE = 60;
const windows = new Map<string, { start: number; count: number }>();

export function checkRate(ip: string) {
	const now = Date.now();
	if (windows.size > 10_000) {
		for (const [key, w] of windows) if (now - w.start > 60_000) windows.delete(key);
	}
	const w = windows.get(ip);
	if (!w || now - w.start > 60_000) {
		windows.set(ip, { start: now, count: 1 });
		return;
	}
	if (++w.count > WRITES_PER_MINUTE) error(429, 'too many saves, wait a minute');
}

/** `a//b/` → `a/b`. Null if it can't be a pad. */
export function normalizePath(raw: string): string | null {
	const segments = raw.split('/').filter((s) => s !== '');
	const path = segments.join('/');
	if (path.length > MAX_PATH || segments.length > MAX_DEPTH) return null;
	for (const s of segments) {
		// eslint-disable-next-line no-control-regex
		if (s.length > MAX_SEGMENT || s === '.' || s === '..' || /[\u0000-\u001f\u007f]/.test(s))
			return null;
	}
	return path;
}
