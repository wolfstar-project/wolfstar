import 'varlock/auto-load';
import { client } from './mocks/MockInstances.js';

afterAll(async () => {
	await client.destroy();
});
