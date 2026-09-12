import { defineConfig } from 'taze';

export default defineConfig({
	write: true,
	// run `npm install` or `yarn install` right after bumping
	install: true,
	update: true,
	recursive: true,
	includeLocked: true,
	interactive: true,
	depFields: {
		overrides: false
	}
});
