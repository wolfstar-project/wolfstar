import { getSchemaChannelTypes } from '#lib/database/settings/schema/channelTypes';
import { describeLockdownChannelOutcome, summarizeLockdownChannels } from '#lib/moderation/lockdownChannels';
import type { Translator } from '#lib/structures/commands/utils';
import { ChannelType } from 'discord-api-types/v10';

describe('lockdown channels', () => {
	// The translator writes the key with its options, so a test reads what was asked for:
	const t = ((key: string, options?: Record<string, unknown>) =>
		options === undefined
			? key
			: `${key}(${Object.entries(options)
					.map(([name, value]) => `${name}=${String(value)}`)
					.join(',')})`) as unknown as Translator;
	const roleId = '254360814063058944';

	test('GIVEN the type of the setting THEN it takes what /lockdown channel: takes, but the threads', () => {
		const types = getSchemaChannelTypes('lockdownChannel');

		expect(types).toContain(ChannelType.GuildText);
		expect(types).toContain(ChannelType.GuildForum);
		expect(types).toContain(ChannelType.GuildVoice);
		expect(types).toContain(ChannelType.GuildCategory);
		expect(types).not.toContain(ChannelType.PublicThread);
	});

	test('GIVEN one channel THEN each outcome is told as the channel option tells it', () => {
		expect(describeLockdownChannelOutcome(t, 'lock', 'done', '1', roleId)).toBe(
			`commands/lockdown:successChannel(channel=<#1>,role=<@&${roleId}>)`
		);
		expect(describeLockdownChannelOutcome(t, 'lock', 'already', '1', roleId)).toContain('channelLocked');
		expect(describeLockdownChannelOutcome(t, 'unlock', 'already', '1', roleId)).toContain('channelUnlocked');
		expect(describeLockdownChannelOutcome(t, 'lock', 'unmanageable', '1', roleId)).toContain('channelUnmanageable');
		expect(describeLockdownChannelOutcome(t, 'lock', 'unknown', '1', roleId)).toContain('channelUnknownChannel');
		expect(describeLockdownChannelOutcome(t, 'unlock', 'failed', '1', roleId)).toContain('channelUnlockFailed');
	});

	test('GIVEN every channel locked THEN the answer is one line with the count', () => {
		const summary = summarizeLockdownChannels(t, 'lock', roleId, [
			{ channelId: '1', outcome: 'done' },
			{ channelId: '2', outcome: 'done' }
		]);

		expect(summary).toBe(`commands/lockdown:configuredLocked(count=2,role=<@&${roleId}>)`);
	});

	test('GIVEN channels already locked and ones that failed THEN they are counted and listed, with why', () => {
		const summary = summarizeLockdownChannels(t, 'unlock', roleId, [
			{ channelId: '1', outcome: 'done' },
			{ channelId: '2', outcome: 'already' },
			{ channelId: '3', outcome: 'unmanageable' },
			{ channelId: '4', outcome: 'unknown' }
		]);

		expect(summary.split('\n')).toEqual([
			`commands/lockdown:configuredUnlocked(count=1,role=<@&${roleId}>)`,
			'commands/lockdown:configuredAlreadyUnlocked(count=1)',
			'commands/lockdown:configuredFailed',
			'- commands/lockdown:channelUnmanageable(channel=<#3>)',
			'- commands/lockdown:channelUnknownChannel(channel=<#4>)'
		]);
	});
});
