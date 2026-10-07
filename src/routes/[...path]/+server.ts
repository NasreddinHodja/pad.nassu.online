import { error, json, text } from '@sveltejs/kit';
import { getPad, putPad } from '#lib/server/db.ts';
import { checkRate, MAX_BYTES, normalizePath } from '#lib/server/limits.ts';
import type { RequestHandler } from './$types';

function padPath(raw: string) {
	const path = normalizePath(raw);
	if (!path) error(400, 'not a valid pad path');
	return path;
}

// What the editor refetches, and `curl pad.nassu.online/foo`. Browsers asking
// for HTML get the page instead.
export const GET: RequestHandler = ({ params }) => {
	const { content, updatedAt } = getPad(padPath(params.path));
	return text(content, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'no-store',
			'x-updated-at': String(updatedAt ?? 0)
		}
	});
};

// The editor's autosave, and `curl -T file -H 'content-type: application/octet-stream'`
// pad.nassu.online/foo: SvelteKit's CSRF check turns away a PUT with no
// content type or a form one (text/plain included) from another origin.
export const PUT: RequestHandler = async ({ params, request, getClientAddress }) => {
	const path = padPath(params.path);
	checkRate(getClientAddress());
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
