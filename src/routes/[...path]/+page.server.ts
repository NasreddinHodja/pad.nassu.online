import { error, fail, redirect } from '@sveltejs/kit';
import {
	access,
	checkPassword,
	claim,
	failed,
	lock,
	owedWait,
	rootOf,
	setPassword,
	succeeded,
	unlock,
	verify
} from '#lib/server/auth.ts';
import { href } from '#lib/href.ts';
import { getPad, subpads } from '#lib/server/db.ts';
import { checkRate, normalizePath } from '#lib/server/limits.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = ({ params, cookies }) => {
	const path = normalizePath(params.path);
	if (path === null) error(400, 'not a valid pad path');
	if (path === '') redirect(308, '/');
	if (path !== params.path) redirect(308, href(path.split('/')));
	const root = rootOf(path);
	const state = access(cookies, root);
	// Not even whether anything is there, until it's unlocked.
	if (state !== 'unlocked') return { path, root, state };
	return { path, root, state, ...getPad(path), subpads: subpads(path) };
};

function target(event: RequestEvent) {
	const path = normalizePath(event.params.path);
	if (!path) error(400, 'not a valid pad path');
	return { path, root: rootOf(path) };
}

const field = (data: FormData, name: string) => {
	const value = data.get(name);
	return typeof value === 'string' ? value : '';
};

/** Checks `password` against the root, backing off repeated misses. */
async function attempt(event: RequestEvent, root: string, password: string) {
	const keys = ['ip:' + event.getClientAddress(), 'root:' + root];
	const wait = owedWait(keys);
	if (wait) return `too many wrong passwords, wait ${Math.ceil(wait / 1000)}s`;
	if (await verify(root, password)) {
		succeeded(keys);
		return null;
	}
	failed(keys);
	return 'wrong password';
}

function newPassword(data: FormData) {
	const password = field(data, 'new');
	const problem =
		checkPassword(password) ??
		(password !== field(data, 'confirm') ? "the passwords don't match" : null);
	return problem ? { problem } : { password };
}

export const actions: Actions = {
	claim: async (event) => {
		const { path, root } = target(event);
		checkRate(event.getClientAddress());
		const result = newPassword(await event.request.formData());
		if ('problem' in result) return fail(400, { problem: result.problem });
		if (!(await claim(root, result.password)))
			return fail(409, { problem: `someone just claimed /${root}, ask them for the password` });
		unlock(event.cookies, root);
		redirect(303, href(path.split('/')));
	},

	unlock: async (event) => {
		const { path, root } = target(event);
		checkRate(event.getClientAddress());
		const problem = await attempt(event, root, field(await event.request.formData(), 'password'));
		if (problem) return fail(problem === 'wrong password' ? 401 : 429, { problem });
		unlock(event.cookies, root);
		redirect(303, href(path.split('/')));
	},

	lock: async (event) => {
		const { root } = target(event);
		lock(event.cookies, root);
		redirect(303, '/');
	},

	// Signs every other browser out of the root.
	password: async (event) => {
		const { path, root } = target(event);
		checkRate(event.getClientAddress());
		if (access(event.cookies, root) !== 'unlocked') error(401, `/${root} is locked`);
		const data = await event.request.formData();
		const result = newPassword(data);
		if ('problem' in result) return fail(400, { problem: result.problem });
		const problem = await attempt(event, root, field(data, 'password'));
		if (problem) return fail(problem === 'wrong password' ? 401 : 429, { problem });
		await setPassword(root, result.password, event.cookies);
		redirect(303, href(path.split('/')));
	}
};
