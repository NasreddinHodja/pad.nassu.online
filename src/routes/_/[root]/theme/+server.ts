import { ours, readCapped, rootParam, unlocked } from '#lib/server/api.ts';
import { checkRate } from '#lib/server/limits.ts';
import { getTheme, MAX_THEME, setTheme } from '#lib/server/theme.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => {
  const root = rootParam(event.params.root);
  unlocked(event, root);
  const theme = getTheme(root);
  return new Response(theme ? new Uint8Array(theme) : null, {
    status: theme ? 200 : 204,
    headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' }
  });
};

export const PUT: RequestHandler = async (event) => {
  ours(event);
  const root = rootParam(event.params.root);
  unlocked(event, root);
  checkRate(event.getClientAddress());
  setTheme(root, await readCapped(event.request, MAX_THEME, 'theme is too big'));
  return new Response(null, { status: 204 });
};
