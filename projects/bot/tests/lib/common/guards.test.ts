import { isWebhookMessage } from '#common';
import { Message } from '@wolfstar/plugin-gateway';
import { MessageType, type APIMessage } from 'discord-api-types/v10';

// A message of the gateway as Discord sends it, built by the class of `@wolfstar/plugin-gateway` and not by a mock:
function createMessage(data: Partial<APIMessage> = {}) {
	return new Message({
		id: '254360814063058946',
		channel_id: '254360814063058945',
		guild_id: '254360814063058944',
		type: MessageType.Default,
		content: 'Free nitro',
		author: { id: '266624760782258186', username: 'member', discriminator: '0', global_name: null, avatar: null },
		attachments: [],
		embeds: [],
		mentions: [],
		mention_roles: [],
		mention_everyone: false,
		pinned: false,
		tts: false,
		timestamp: '2026-11-02T12:42:19.130000+00:00',
		edited_timestamp: null,
		...data
	} as APIMessage);
}

describe('isWebhookMessage', () => {
	test('GIVEN a message of a member THEN it is not one of a webhook', () => {
		expect(isWebhookMessage(createMessage())).toBe(false);
	});

	test('GIVEN a message of a webhook THEN it is one of a webhook', () => {
		expect(isWebhookMessage(createMessage({ webhook_id: '254360814063058947' }))).toBe(true);
	});
});
