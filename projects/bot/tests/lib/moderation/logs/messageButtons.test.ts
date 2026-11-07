import { decodeLogUserId, encodeLogUserId, getMessageLogButtons } from '#lib/moderation/logs/messageButtons';
import { ButtonStyle } from 'discord-api-types/v10';

const userId = '266624760782258186';

describe('the buttons of the log of a message', () => {
	// Echoes the key, the translations are not what is tested here:
	const t = ((key: string) => key) as never;

	test('GIVEN a message THEN there is a button for the ID of who sent it and a link to the message', () => {
		const [id, jump] = getMessageLogButtons(t, { userId, guildId: '1', channelId: '2', messageId: '3' }) as unknown as [
			{ style: ButtonStyle; custom_id: string; label: string },
			{ style: ButtonStyle; url: string; label: string }
		];

		expect(id).toMatchObject({ style: ButtonStyle.Secondary, label: 'events/messages:logGetUserId' });
		expect(jump).toEqual({
			type: 2,
			style: ButtonStyle.Link,
			url: 'https://discord.com/channels/1/2/3',
			label: 'events/messages:logJumpToMessage'
		});
	});

	test('GIVEN the custom ID of the button THEN it gives the user back', () => {
		const [id] = getMessageLogButtons(t, { userId, guildId: '1', channelId: '2', messageId: '3' }) as unknown as [{ custom_id: string }];

		expect(id.custom_id).toBe(`logUser.${userId}.id`);
		expect(decodeLogUserId(id.custom_id.split('.').slice(1))).toBe(userId);
		expect(encodeLogUserId(userId)).toBe(id.custom_id);
	});

	test('GIVEN what is not the button of a log THEN there is no user', () => {
		expect(decodeLogUserId(null)).toBeNull();
		expect(decodeLogUserId(['not-an-id', 'id'])).toBeNull();
		expect(decodeLogUserId([userId, 'other'])).toBeNull();
	});
});
