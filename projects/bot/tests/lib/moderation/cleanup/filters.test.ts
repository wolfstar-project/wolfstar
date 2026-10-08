import { matchesCleanupFilter, shouldAutoDelete, type CleanupMessage } from '#lib/moderation/cleanup/filters';
import { CleanupFilterKinds } from 'wolfstar-database';

function createMessage(overrides: Partial<CleanupMessage> = {}): CleanupMessage {
	return { content: 'Hello there', author: { id: '266624760782258186', bot: false }, attachments: [], embeds: [], ...overrides };
}

describe('cleanup filters', () => {
	describe('matchesCleanupFilter', () => {
		test('GIVEN any message THEN `any` matches it', () => {
			expect(matchesCleanupFilter(createMessage(), 'any')).toBe(true);
		});

		test('GIVEN a user THEN only their messages match', () => {
			expect(matchesCleanupFilter(createMessage(), 'user', '266624760782258186')).toBe(true);
			expect(matchesCleanupFilter(createMessage(), 'user', '242043489611808769')).toBe(false);
			expect(matchesCleanupFilter(createMessage(), 'user', null)).toBe(false);
		});

		test('GIVEN a text THEN it is looked for whatever the case', () => {
			const message = createMessage({ content: 'Buy CHEAP gold now' });

			expect(matchesCleanupFilter(message, 'contains', 'cheap')).toBe(true);
			expect(matchesCleanupFilter(message, 'notContains', 'cheap')).toBe(false);
			expect(matchesCleanupFilter(message, 'notContains', 'silver')).toBe(true);
			expect(matchesCleanupFilter(message, 'startsWith', 'BUY')).toBe(true);
			expect(matchesCleanupFilter(message, 'startsWith', 'gold')).toBe(false);
			expect(matchesCleanupFilter(message, 'endsWith', 'Now')).toBe(true);
		});

		test('GIVEN a text filter without a text THEN nothing matches, so a broken purge deletes nothing', () => {
			for (const kind of ['contains', 'notContains', 'startsWith', 'endsWith'] as const) {
				expect(matchesCleanupFilter(createMessage(), kind, '')).toBe(false);
				expect(matchesCleanupFilter(createMessage(), kind, null)).toBe(false);
			}
		});

		test('GIVEN links and invites THEN they are told apart from plain text', () => {
			expect(matchesCleanupFilter(createMessage({ content: 'see https://wolfstar.rocks/commands' }), 'links')).toBe(true);
			expect(matchesCleanupFilter(createMessage({ content: 'see wolfstar' }), 'links')).toBe(false);
			expect(matchesCleanupFilter(createMessage({ content: 'join discord.gg/wolfstar' }), 'invites')).toBe(true);
			expect(matchesCleanupFilter(createMessage({ content: 'https://wolfstar.rocks' }), 'invites')).toBe(false);
		});

		test('GIVEN attachments THEN only the images are images, as an array or as a collection', () => {
			const image = { url: 'https://cdn.discordapp.com/attachments/1/2/cat.png' };
			const file = { url: 'https://cdn.discordapp.com/attachments/1/2/notes.txt' };

			expect(matchesCleanupFilter(createMessage({ attachments: [image] }), 'images')).toBe(true);
			expect(matchesCleanupFilter(createMessage({ attachments: [file] }), 'images')).toBe(false);
			expect(matchesCleanupFilter(createMessage({ attachments: new Map([['1', image]]) }), 'images')).toBe(true);
		});

		test('GIVEN mentions THEN users, roles, channels and everyone are found in the text', () => {
			for (const content of [
				'<@266624760782258186>',
				'<@!266624760782258186>',
				'<@&266624760782258186>',
				'<#266624760782258186>',
				'@everyone',
				'hi @here'
			]) {
				expect(matchesCleanupFilter(createMessage({ content }), 'mentions')).toBe(true);
			}
			expect(matchesCleanupFilter(createMessage({ content: 'mail me at a@b.c' }), 'mentions')).toBe(false);
		});

		test('GIVEN embeds, bots and humans THEN each is told apart', () => {
			const bot = createMessage({ author: { id: '1', bot: true }, embeds: [{}] });

			expect(matchesCleanupFilter(bot, 'embeds')).toBe(true);
			expect(matchesCleanupFilter(createMessage(), 'embeds')).toBe(false);
			expect(matchesCleanupFilter(bot, 'bots')).toBe(true);
			expect(matchesCleanupFilter(bot, 'humans')).toBe(false);
			expect(matchesCleanupFilter(createMessage(), 'humans')).toBe(true);
		});

		test('GIVEN a message that is only text THEN `text` matches it, and not one with an attachment or without text', () => {
			expect(matchesCleanupFilter(createMessage(), 'text')).toBe(true);
			expect(matchesCleanupFilter(createMessage({ attachments: [{ url: 'https://x/a.png' }] }), 'text')).toBe(false);
			expect(matchesCleanupFilter(createMessage({ content: '   ' }), 'text')).toBe(false);
		});

		test('GIVEN every filter THEN it answers with a boolean', () => {
			for (const kind of CleanupFilterKinds) expect(typeof matchesCleanupFilter(createMessage(), kind, 'x')).toBe('boolean');
		});
	});

	describe('shouldAutoDelete', () => {
		test('GIVEN a channel that keeps nothing THEN every message of a member is deleted', () => {
			expect(shouldAutoDelete(createMessage(), { allow: [], bots: false })).toBe(true);
		});

		test('GIVEN what the channel keeps THEN a message that has one of them is kept', () => {
			const config = { allow: ['links', 'images'], bots: false } as const;

			expect(shouldAutoDelete(createMessage({ content: 'https://wolfstar.rocks' }), { ...config, allow: [...config.allow] })).toBe(false);
			expect(shouldAutoDelete(createMessage({ attachments: [{ url: 'https://x/cat.png' }] }), { ...config, allow: [...config.allow] })).toBe(
				false
			);
			expect(shouldAutoDelete(createMessage(), { ...config, allow: [...config.allow] })).toBe(true);
		});

		test('GIVEN the message of a bot THEN it is kept unless the channel deletes them too', () => {
			const bot = createMessage({ author: { id: '1', bot: true } });

			expect(shouldAutoDelete(bot, { allow: [], bots: false })).toBe(false);
			expect(shouldAutoDelete(bot, { allow: [], bots: true })).toBe(true);
		});
	});
});
