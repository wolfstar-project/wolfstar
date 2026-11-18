import { formatCommandErrorReport, getErrorWebhook, isReportableCommandError } from '#utils/errorWebhook';
import { ResultError } from '@sapphire/result';
import { UserError } from '@wolfstar/http-framework';
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

describe('isReportableCommandError', () => {
	it('leaves out what the user is answered with', () => {
		expect(isReportableCommandError('errors:something')).toBe(false);
		expect(isReportableCommandError(new UserError({ identifier: 'x' }))).toBe(false);
		expect(isReportableCommandError(new ResultError('failed', new UserError({ identifier: 'x' })))).toBe(false);
		expect(isReportableCommandError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(false);
	});

	it('reports the bugs', () => {
		expect(isReportableCommandError(new TypeError('boom'))).toBe(true);
		expect(isReportableCommandError({ unknown: true })).toBe(true);
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

	it('fits an embed description', () => {
		const error = new Error('x'.repeat(10_000));
		expect(formatCommandErrorReport(error, interaction).length).toBeLessThanOrEqual(4096);
	});
});
