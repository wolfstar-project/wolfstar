import { Auth, resolveRequestAuth, type ApiAuthRequest, type AuthData } from '#lib/api/Auth';
import type { ApiResponse } from '@wolfstar/plugin-api';

const secret = 'a'.repeat(32);

function makeAuth(domainOverwrite: string | null = null) {
	return new Auth({ id: '266624760782258186', secret, cookie: 'WOLFSTAR_AUTH', domainOverwrite });
}

function makeData(expires = Date.now() + 60_000): AuthData {
	return { id: '242043489611808769', expires, refresh: 'refresh', token: 'token' };
}

function makeResponse(cookies: Record<string, string> = {}) {
	const store = new Map(Object.entries(cookies)) as ApiResponse['cookies'];
	store.add = vi.fn(() => store);
	store.remove = vi.fn(() => store);
	return { cookies: store } as ApiResponse;
}

describe('Auth', () => {
	describe('create', () => {
		test('GIVEN no secret THEN returns null', () => {
			expect(Auth.create({ id: '266624760782258186' })).toBeNull();
		});

		test('GIVEN no id THEN returns null', () => {
			expect(Auth.create({ secret })).toBeNull();
		});

		test('GIVEN an id and a secret THEN returns an instance with the defaults', () => {
			const auth = Auth.create({ id: '266624760782258186', secret });
			expect(auth).toBeInstanceOf(Auth);
			expect(auth!.cookie).toBe('SAPPHIRE_AUTH');
			expect(auth!.scopes).toEqual(['identify']);
			expect(auth!.domainOverwrite).toBeNull();
		});
	});

	describe('encrypt and decrypt', () => {
		test('GIVEN encrypted data THEN decrypts it back', () => {
			const auth = makeAuth();
			const data = makeData();
			expect(auth.decrypt(auth.encrypt(data))).toEqual(data);
		});

		test('GIVEN expired data THEN returns null', () => {
			const auth = makeAuth();
			expect(auth.decrypt(auth.encrypt(makeData(Date.now() - 1)))).toBeNull();
		});

		test('GIVEN a malformed token THEN returns null', () => {
			const auth = makeAuth();
			expect(auth.decrypt('not-a-token')).toBeNull();
			expect(auth.decrypt('abc.def')).toBeNull();
		});

		test('GIVEN a token of another secret THEN returns null', () => {
			const other = new Auth({ id: '1', secret: 'b'.repeat(32) });
			expect(makeAuth().decrypt(other.encrypt(makeData()))).toBeNull();
		});
	});

	describe('cookies', () => {
		test('GIVEN no domain overwrite THEN sets and removes the cookie on the default domain', () => {
			const auth = makeAuth();
			const response = makeResponse();

			auth.setCookie(response, 'value', 10);
			expect(response.cookies.add).toHaveBeenCalledWith('WOLFSTAR_AUTH', 'value', { maxAge: 10, domain: undefined });

			auth.removeCookie(response);
			expect(response.cookies.remove).toHaveBeenCalledWith('WOLFSTAR_AUTH');
		});

		test('GIVEN a domain overwrite THEN sets and expires the cookie on that domain', () => {
			const auth = makeAuth('.wolfstar.rocks');
			const response = makeResponse({ WOLFSTAR_AUTH: 'stale' });

			auth.setCookie(response, 'value', 10);
			expect(response.cookies.add).toHaveBeenCalledWith('WOLFSTAR_AUTH', 'value', { maxAge: 10, domain: '.wolfstar.rocks' });

			auth.removeCookie(response);
			expect(response.cookies.add).toHaveBeenLastCalledWith('WOLFSTAR_AUTH', '', { expires: new Date(0), domain: '.wolfstar.rocks' });
			expect(response.cookies.has('WOLFSTAR_AUTH')).toBe(false);
		});
	});
});

describe('resolveRequestAuth', () => {
	test('GIVEN no authentication THEN leaves the request untouched', () => {
		const request = {} as ApiAuthRequest;
		expect(resolveRequestAuth(null, request, makeResponse())).toBeUndefined();
		expect(request.auth).toBeUndefined();
	});

	test('GIVEN no cookie THEN sets null', () => {
		const request = {} as ApiAuthRequest;
		expect(resolveRequestAuth(makeAuth(), request, makeResponse())).toBeNull();
		expect(request.auth).toBeNull();
	});

	test('GIVEN a valid cookie THEN sets the session', () => {
		const auth = makeAuth();
		const data = makeData();
		const request = {} as ApiAuthRequest;
		const response = makeResponse({ WOLFSTAR_AUTH: auth.encrypt(data) });

		expect(resolveRequestAuth(auth, request, response)).toEqual(data);
		expect(request.auth).toEqual(data);
		expect(response.cookies.remove).not.toHaveBeenCalled();
	});

	test('GIVEN an invalid cookie THEN sets null and removes the cookie', () => {
		const request = {} as ApiAuthRequest;
		const response = makeResponse({ WOLFSTAR_AUTH: 'garbage' });

		expect(resolveRequestAuth(makeAuth(), request, response)).toBeNull();
		expect(response.cookies.remove).toHaveBeenCalledWith('WOLFSTAR_AUTH');
	});

	test('GIVEN an already resolved request THEN does not read the cookie again', () => {
		const data = makeData();
		const request = { auth: data } as ApiAuthRequest;
		const response = makeResponse({ WOLFSTAR_AUTH: 'garbage' });

		expect(resolveRequestAuth(makeAuth(), request, response)).toBe(data);
		expect(response.cookies.remove).not.toHaveBeenCalled();
	});
});
