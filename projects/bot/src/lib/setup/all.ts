import { setup as envRun } from '@wolfstar/env-utilities';

export function initializeApp() {
	envRun(new URL('../../../src/.env', import.meta.url));
}
