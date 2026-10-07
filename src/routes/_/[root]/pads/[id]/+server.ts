import { error, json } from '@sveltejs/kit';
import { ours, rootParam, unlocked } from '#lib/server/api.ts';
import { rootOf } from '#lib/server/auth.ts';
import { deleteSealed, getSealed, migrateLegacy, putSealed } from '#lib/server/db.ts';
import { checkRate, MAX_SEALED, MAX_SEALED_NAME } from '#lib/server/limits.ts';
import type { RequestEvent, RequestHandler } from './$types';

/** A pad's id is the base64url of its 32-byte HMAC. */
function target(event: RequestEvent) {
	const root = rootParam(event.params.root);
	unlocked(event, root);
	if (!/^[A-Za-z0-9_-]{43}$/.test(event.params.id)) error(400, 'not a valid pad id');
	return { root, id: event.params.id };
}

export const GET: RequestHandler = (event) => {
	const { root, id } = target(event);
	const row = getSealed(root, id);
	return new Response(row ? new Uint8Array(row.data) : null, {
		status: row ? 200 : 204,
		headers: {
			'content-type': 'application/octet-stream',
			'cache-control': 'no-store',
			'x-updated-at': String(row?.updated_at ?? 0)
		}
	});
};

// The editor's autosave: the sealed text as the body, the sealed path in a
// header. Or a pad from before encryption, sealed: `x-pad-legacy` names its
// plain copy, deleted in the same transaction. Those skip the rate limit,
// since each needs a plain pad to use up and a root can have hundreds.
export const PUT: RequestHandler = async (event) => {
	ours(event);
	const { root, id } = target(event);
	const legacy = event.request.headers.get('x-pad-legacy');
	const legacyPath = legacy === null ? null : decodeURIComponent(legacy);
	if (legacyPath !== null && rootOf(legacyPath) !== root) error(400, 'not a pad of this root');
	if (legacyPath === null) checkRate(event.getClientAddress());
	const name = event.request.headers.get('x-pad-name') ?? '';
	if (!/^[A-Za-z0-9_-]+$/.test(name) || name.length > MAX_SEALED_NAME)
		error(400, 'malformed pad name');
	if (Number(event.request.headers.get('content-length') ?? 0) > MAX_SEALED)
		error(413, 'pad is over 512 KiB');
	const data = await readCapped(event.request);
	if (legacyPath === null) return json({ updatedAt: putSealed(root, id, name, data) });
	if (!migrateLegacy(root, id, name, data, legacyPath)) error(409, 'already encrypted');
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = (event) => {
	ours(event);
	const { root, id } = target(event);
	checkRate(event.getClientAddress());
	deleteSealed(root, id);
	return new Response(null, { status: 204 });
};

// A missing or lying content-length mustn't let a body past the cap.
async function readCapped(request: Request) {
	if (!request.body) error(400, 'empty pad');
	const chunks: Uint8Array[] = [];
	let size = 0;
	for await (const chunk of request.body) {
		size += chunk.byteLength;
		if (size > MAX_SEALED) error(413, 'pad is over 512 KiB');
		chunks.push(chunk);
	}
	return new Uint8Array(Buffer.concat(chunks));
}
