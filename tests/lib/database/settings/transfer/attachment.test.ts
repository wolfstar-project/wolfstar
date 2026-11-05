import { downloadConfigurationFile } from '#lib/database/settings/transfer/attachment';
import { MaximumConfigurationFileSize } from '#lib/database/settings/transfer/format';

afterEach(() => vi.unstubAllGlobals());

it.each(['http://cdn.discordapp.com/a', 'https://example.com/a', 'not a url'])('does not fetch untrusted attachment URL %s', async (url) => {
	const fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	expect(await downloadConfigurationFile({ url, size: 10 })).toBeNull();
	expect(fetch).not.toHaveBeenCalled();
});

it('rejects a response that exceeds the advertised file size', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(MaximumConfigurationFileSize + 1))));
	expect(await downloadConfigurationFile({ url: 'https://cdn.discordapp.com/a.json', size: 10 })).toBeNull();
});

it('reads JSON attachments from Discord', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"version":1}')));
	expect(await downloadConfigurationFile({ url: 'https://cdn.discordapp.com/a.json', size: 13 })).toBe('{"version":1}');
});
