import { error, type RequestEvent } from '@sveltejs/kit';
import { access, sameOrigin } from './auth.ts';
import { normalizePath } from './limits.ts';

/** The `[root]` param, if it names a root. */
export function rootParam(raw: string) {
	const root = normalizePath(raw);
	if (!root || root.includes('/')) error(400, 'not a valid root');
	return root;
}

/** For every request that changes something: only our own page may send it. */
export function ours(event: RequestEvent) {
	if (!sameOrigin(event)) error(403, 'cross-site request refused');
}

export function unlocked(event: RequestEvent, root: string) {
	if (access(event.cookies, root) !== 'unlocked') error(401, `/${root} is locked`);
}

/** Base64url (no padding) of exactly `length` bytes. */
export function bytes(value: unknown, length: number) {
	if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value)) error(400, 'malformed body');
	const decoded = Buffer.from(value, 'base64url');
	if (decoded.length !== length) error(400, 'malformed body');
	return new Uint8Array(decoded);
}

export async function body(request: Request) {
	const json = await request.json().catch(() => null);
	if (!json || typeof json !== 'object') error(400, 'malformed body');
	return json as Record<string, unknown>;
}
