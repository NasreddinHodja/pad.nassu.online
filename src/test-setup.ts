// `bun test` runs outside SvelteKit: a database of its own, and what
// `$app/env` would say in dev.
import { mock } from 'bun:test';

process.env.PAD_DB = ':memory:';
mock.module('$app/env', () => ({ dev: true }));
