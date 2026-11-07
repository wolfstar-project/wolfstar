import { convertLegacyAuditEvent, convertLegacyCommandLog, convertLegacyUser } from '../../src/legacy/logs.js';

const Id = '254360814063058944';

function event(overrides: Record<string, unknown> = {}) {
	return {
		id: '6f8f9a3e-0d3a-4b0e-9d3c-6a1b1f0a7c11',
		action: 'guild.settings.update',
		actor_type: 'user',
		actor_id: Id,
		actor_name: 'someone',
		target_type: 'guild',
		target_id: Id,
		outcome: 'success',
		tenant_id: Id,
		reason: null,
		timestamp: '2026-01-02T03:04:05.678912',
		changes: { language: ['a', 'b'] },
		context: { source: 'web' },
		prev_hash: 'a'.repeat(64),
		hash: 'b'.repeat(64),
		...overrides
	};
}

describe('legacy logs', () => {
	test('GIVEN an audit event THEN every field stays, the date to the millisecond', () => {
		const source = event();
		expect(convertLegacyAuditEvent(source)).toEqual({ ...source, timestamp: '2026-01-02 03:04:05.678' });
	});

	test('GIVEN an author that is not a number THEN it is 0, and the original stays in the context', () => {
		expect(convertLegacyAuditEvent(event({ actor_id: 'web' }))).toMatchObject({
			actor_id: '0',
			context: { source: 'web', legacyActorId: 'web' },
			hash: 'b'.repeat(64)
		});
	});

	test('GIVEN a target or a tenant that is not a number THEN it is empty, and the original stays in the context', () => {
		expect(convertLegacyAuditEvent(event({ target_id: 'x', tenant_id: 'y', context: null }))).toMatchObject({
			target_id: null,
			tenant_id: null,
			context: { legacyTargetId: 'x', legacyTenantId: 'y' }
		});
	});

	function commandLog(overrides: Record<string, unknown> = {}) {
		return {
			id: '6f8f9a3e-0d3a-4b0e-9d3c-6a1b1f0a7c12',
			guild_id: Id,
			user_id: Id,
			command_name: 'ban',
			command_type: 'chat',
			command_id: null,
			subcommand: null,
			channel_id: Id,
			success: true,
			error_reason: null,
			executed_at: '2026-01-02T03:04:05.678912',
			latency_ms: 10,
			metadata: null,
			...overrides
		};
	}

	test('GIVEN a command log THEN every field stays', () => {
		expect(convertLegacyCommandLog(commandLog())).toEqual({ ...commandLog(), executed_at: '2026-01-02 03:04:05.678' });
	});

	test('GIVEN a command log out of a guild THEN it is left out', () => {
		expect(convertLegacyCommandLog(commandLog({ guild_id: 'dm' }))).toBeNull();
	});

	test('GIVEN a user THEN their direct messages are the preference of V7', () => {
		expect(convertLegacyUser({ id: Id, moderation_dm: false })).toEqual({ id: Id, report: false });
		expect(convertLegacyUser({ id: 'nope', moderation_dm: false })).toBeNull();
	});
});
