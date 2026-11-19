import { fetchApproximateUserCount, type GuildPageReader } from '#utils/analytics';
import { DiscordAPIError, HTTPError } from '@discordjs/rest';
import type { RESTGetAPICurrentUserGuildsResult } from 'discord-api-types/v10';

function guildPage(counts: number[], firstId = 1): RESTGetAPICurrentUserGuildsResult {
	return counts.map((count, index) => ({ id: String(firstId + index), approximate_member_count: count })) as RESTGetAPICurrentUserGuildsResult;
}

function failingReader(error: unknown): GuildPageReader {
	return { getGuilds: () => Promise.reject(error) };
}

describe('fetchApproximateUserCount', () => {
	it('sums the member counts of every page', async () => {
		const pages = [guildPage(Array.from({ length: 200 }, () => 2)), guildPage([5, 7], 201)];
		const reader: GuildPageReader = { getGuilds: () => Promise.resolve(pages.shift()!) };

		await expect(fetchApproximateUserCount(reader)).resolves.toEqual({ _tag: 'Counted', users: 412 });
	});

	it('answers Unavailable when Discord fails with a server error', async () => {
		const error = new HTTPError(500, 'Internal Server Error', 'GET', 'https://discord.com/api/v10/users/@me/guilds', {});

		await expect(fetchApproximateUserCount(failingReader(error))).resolves.toEqual({ _tag: 'Unavailable', status: 500 });
	});

	it('answers Unavailable when Discord answers a server error with a body', async () => {
		const error = new DiscordAPIError({ code: 0, message: 'Bad Gateway' }, 0, 502, 'GET', 'https://discord.com/api/v10/users/@me/guilds', {});

		await expect(fetchApproximateUserCount(failingReader(error))).resolves.toEqual({ _tag: 'Unavailable', status: 502 });
	});

	it('throws a client error, which is a bug of the bot', async () => {
		const error = new DiscordAPIError(
			{ code: 50001, message: 'Missing Access' },
			50001,
			403,
			'GET',
			'https://discord.com/api/v10/users/@me/guilds',
			{}
		);

		await expect(fetchApproximateUserCount(failingReader(error))).rejects.toBe(error);
	});
});
