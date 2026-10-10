import { resolveMessageReference } from '#lib/moderation/structures/ModerationCommand';

describe('resolveMessageReference', () => {
	const guildId = '254360814063058944';
	const channelId = '254360814063058945';
	const messageId = '1557124128337829937';
	const t = ((key: string) => key) as never;

	test('GIVEN no option THEN there is no message', () => {
		expect(resolveMessageReference(t, guildId, channelId, undefined)).toBeNull();
		expect(resolveMessageReference(t, guildId, channelId, '  ')).toBeNull();
	});

	test('GIVEN the link of a message of the guild THEN it is read', () => {
		const other = '254360814063058999';
		for (const host of ['discord.com', 'canary.discord.com', 'ptb.discordapp.com']) {
			expect(resolveMessageReference(t, guildId, channelId, `https://${host}/channels/${guildId}/${other}/${messageId}`)).toEqual({
				channelId: other,
				messageId
			});
		}
	});

	test('GIVEN the ID of a message THEN it is one of the channel the command was run in', () => {
		expect(resolveMessageReference(t, guildId, channelId, ` ${messageId} `)).toEqual({ channelId, messageId });
	});

	test('GIVEN the ID Discord copies with shift held THEN its channel is read', () => {
		expect(resolveMessageReference(t, guildId, channelId, `254360814063058999-${messageId}`)).toEqual({
			channelId: '254360814063058999',
			messageId
		});
	});

	test('GIVEN the link of a message of another guild, or something else THEN it is refused', () => {
		expect(() =>
			resolveMessageReference(t, guildId, channelId, `https://discord.com/channels/254360814063058000/${channelId}/${messageId}`)
		).toThrow('commands/shared:messageReferenceInvalid');
		expect(() => resolveMessageReference(t, guildId, channelId, 'that message')).toThrow('commands/shared:messageReferenceInvalid');
		expect(() => resolveMessageReference(t, guildId, channelId, `https://example.com/channels/${guildId}/${channelId}/${messageId}`)).toThrow(
			'commands/shared:messageReferenceInvalid'
		);
	});
});
