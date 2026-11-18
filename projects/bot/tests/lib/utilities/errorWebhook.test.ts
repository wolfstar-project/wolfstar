import { formatCommandErrorReport, getErrorWebhook, redactRequestUrl } from '#utils/errorWebhook';
import { DiscordAPIError } from '@discordjs/rest';
import { ApplicationCommandOptionType, ApplicationCommandType, type APIApplicationCommandInteraction } from 'discord-api-types/v10';

describe('getErrorWebhook', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('needs both the ID and the token', () => {
		vi.stubEnv('WEBHOOK_ERROR_ID', '1');
		vi.stubEnv('WEBHOOK_ERROR_TOKEN', '');
		expect(getErrorWebhook()).toBeNull();

		vi.stubEnv('WEBHOOK_ERROR_TOKEN', 'token');
		expect(getErrorWebhook()).toEqual({ id: '1', token: 'token' });
	});
});

describe('redactRequestUrl', () => {
	it('hides the token of an interaction or a webhook', () => {
		expect(redactRequestUrl('https://discord.com/api/v10/webhooks/123/aW50ZXJhY3Rpb24.token/messages/@original')).toBe(
			'https://discord.com/api/v10/webhooks/123/<redacted>/messages/@original'
		);
		expect(redactRequestUrl('https://discord.com/api/v10/interactions/456/secret-token/callback?with_response=true')).toBe(
			'https://discord.com/api/v10/interactions/456/<redacted>/callback'
		);
	});

	it('leaves the other routes alone', () => {
		expect(redactRequestUrl('https://discord.com/api/v10/channels/1/messages')).toBe('https://discord.com/api/v10/channels/1/messages');
	});
});

describe('formatCommandErrorReport', () => {
	const interaction = {
		guild_id: '10',
		channel: { id: '20' },
		member: { user: { id: '30' } },
		data: {
			type: ApplicationCommandType.ChatInput,
			name: 'ban',
			options: [
				{
					type: ApplicationCommandOptionType.Subcommand,
					name: 'add',
					options: [
						{ type: ApplicationCommandOptionType.User, name: 'user', value: '40' },
						{ type: ApplicationCommandOptionType.String, name: 'reason', value: 'spam' }
					]
				}
			]
		}
	} as unknown as APIApplicationCommandInteraction;

	it('names the place, the command and its options', () => {
		const report = formatCommandErrorReport(new Error('boom'), interaction);
		expect(report).toContain('**Where**: 10/20 | **User**: 30');
		expect(report).toContain('`/ban add user:"40" reason:"spam"`');
		expect(report).toContain('Error: boom');
	});

	it('never shows the token of a failed follow-up', () => {
		const error = new DiscordAPIError(
			{ code: 10008, message: 'Unknown Message' },
			10008,
			404,
			'PATCH',
			'https://discord.com/api/v10/webhooks/123/interaction-token/messages/@original',
			{ body: undefined, files: undefined }
		);
		const report = formatCommandErrorReport(error, interaction);
		expect(report).toContain('**Path**: PATCH https://discord.com/api/v10/webhooks/123/<redacted>/messages/@original');
		expect(report).not.toContain('interaction-token/');
	});

	it('fits an embed description', () => {
		const error = new Error('x'.repeat(10_000));
		expect(formatCommandErrorReport(error, interaction).length).toBeLessThanOrEqual(4096);
	});
});
