import { getWebsiteUrl } from '#utils/website';

describe('getWebsiteUrl', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test('GIVEN an API that answers one website THEN links lead to that website', () => {
		vi.stubEnv('API_ORIGIN', 'https://alpha.wolfstar.rocks');
		expect(getWebsiteUrl()).toBe('https://alpha.wolfstar.rocks');
	});

	test('GIVEN an origin with a path or a trailing slash THEN only the origin is kept', () => {
		vi.stubEnv('API_ORIGIN', 'http://localhost:3000/');
		expect(getWebsiteUrl()).toBe('http://localhost:3000');
	});

	test.each(['*', 'not a url', 'ftp://files.example.com'])('GIVEN an API_ORIGIN of %s THEN links lead to the production website', (origin) => {
		vi.stubEnv('API_ORIGIN', origin);
		expect(getWebsiteUrl()).toBe('https://wolfstar.rocks');
	});
});
