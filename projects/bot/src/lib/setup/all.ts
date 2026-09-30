import { setup as envRun } from '@wolfstar/env-utilities';

export function initializeApp() {
	envRun({ path: new URL('../../../src/.env', import.meta.url), loader: 'varlock' });
}
