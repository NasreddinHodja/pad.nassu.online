import { error, redirect } from '@sveltejs/kit';
import { getPad, subpads } from '#lib/server/db.ts';
import { normalizePath } from '#lib/server/limits.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const path = normalizePath(params.path);
	if (path === null) error(400, 'not a valid pad path');
	if (path === '') redirect(308, '/');
	if (path !== params.path) redirect(308, '/' + path.split('/').map(encodeURIComponent).join('/'));
	return { path, ...getPad(path), subpads: subpads(path) };
};
