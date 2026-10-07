import { error, json, text } from '@sveltejs/kit';
import { access, rootOf, sameOrigin } from '#lib/server/auth.ts';
import { getPad, putPad } from '#lib/server/db.ts';
import { checkRate, MAX_BYTES, normalizePath } from '#lib/server/limits.ts';
import type { RequestHandler } from './$types';

function padPath(raw: string) {
	const path = normalizePath(raw);
	if (!path) error(400, 'not a valid pad path');
	return path;
}

// What the editor refetches, and `curl pad.nassu.online/foo` while the root is
// unclaimed. Browsers asking for HTML get the page instead.
export const GET: RequestHandler = ({ params, cookies }) => {
	const path = padPath(params.path);
	const root = rootOf(path);
	if (access(cookies, root) === 'locked') error(401, `/${root} is locked`);
	const { content, updatedAt } = getPad(path);
	return text(content, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'no-store',
			'x-updated-at': String(updatedAt ?? 0)
		}
	});
};

// The editor's autosave. Only the page's own requests get through: they carry
// the unlock cookie, and the browser marks them same-origin.
export const PUT: RequestHandler = async (event) => {
	const { params, request, cookies, getClientAddress } = event;
	const path = padPath(params.path);
	checkRate(getClientAddress());
	const root = rootOf(path);
	const state = access(cookies, root);
	if (state === 'open') error(403, `/${root} needs a password first: open it in a browser`);
	if (state === 'locked') error(401, `/${root} is locked, reload to unlock it`);
	if (!sameOrigin(event)) error(403, 'cross-site request refused');
	if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES)
		error(413, 'pad is over 512 KiB');
	const content = await readCapped(request);
	return json({ updatedAt: putPad(path, content) });
};

// A missing or lying content-length mustn't let a body past the cap.
async function readCapped(request: Request) {
	if (!request.body) return '';
	const chunks: Uint8Array[] = [];
	let size = 0;
	for await (const chunk of request.body) {
		size += chunk.byteLength;
		if (size > MAX_BYTES) error(413, 'pad is over 512 KiB');
		chunks.push(chunk);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}
