import { buildCommandExecuteEmbed, buildSettingsChangeEmbed } from '#lib/util/functions/auditLogEmbeds';
import { Colors } from 'discord.js';

const translations: Record<string, string> = {
	'events/guilds-logs:commandTypeChatInput': 'Chat Input',
	'events/guilds-logs:commandTypeContextMenu': 'Context Menu',
	'events/guilds-logs:commandTypeMessage': 'Message Command'
};

const mockT = (key: string | { toString(): string }) => translations[String(key)] ?? String(key);

describe('buildCommandExecuteEmbed', () => {
	it('returns an EmbedBuilder with blue color and expected fields', () => {
		const payload = {
			actorId: '123456789012345678',
			commandName: 'ban',
			commandType: 'chat-input' as const,
			channelId: '987654321098765432',
			timestamp: new Date('2026-05-16T00:00:00.000Z')
		};
		const embed = buildCommandExecuteEmbed(mockT as any, payload);
		const data = embed.toJSON();
		expect(data.color).toBe(Colors.Blue);
		expect(data.fields).toHaveLength(4);
		expect(data.fields![0].value).toBe('<@123456789012345678>');
		expect(data.fields![1].value).toBe('`/ban`');
		expect(data.fields![2].value).toBe('Slash Command');
		expect(data.fields![3].value).toBe('<#987654321098765432>');
	});

	it('renders non-slash commands without a leading slash', () => {
		const payload = {
			actorId: '123456789012345678',
			commandName: 'userinfo',
			commandType: 'message' as const,
			channelId: '987654321098765432',
			timestamp: new Date('2026-05-16T00:00:00.000Z')
		};
		const embed = buildCommandExecuteEmbed(mockT as any, payload);
		const data = embed.toJSON();
		expect(data.fields![1].value).toBe('`userinfo`');
	});
});

describe('buildSettingsChangeEmbed', () => {
	it('returns a green embed for settings update with diff fields', () => {
		const payload = {
			actorId: '111111111111111111',
			action: 'guild.settings.update' as const,
			before: { reason: 'a' },
			after: { reason: 'b' },
			reason: null,
			timestamp: new Date('2026-05-16T00:00:00.000Z')
		};
		const embed = buildSettingsChangeEmbed(mockT as any, payload);
		const data = embed.toJSON();
		expect(data.color).toBe(Colors.Green);
		// Should have at least the user field + change count field + 1 diff field
		expect(data.fields!.length).toBeGreaterThanOrEqual(3);
		const changeField = data.fields!.find((f) => f.name === 'reason');
		expect(changeField).toBeDefined();
		expect(changeField!.value).toContain('->');
	});

	it('returns a yellow embed for access-denied', () => {
		const payload = {
			actorId: '222222222222222222',
			action: 'guild.settings.access-denied' as const,
			before: {},
			after: {},
			reason: 'Unauthorized',
			timestamp: new Date('2026-05-16T00:00:00.000Z')
		};
		const embed = buildSettingsChangeEmbed(mockT as any, payload);
		const data = embed.toJSON();
		expect(data.color).toBe(Colors.Yellow);
		expect(data.description).toBe('Unauthorized');
	});
});
