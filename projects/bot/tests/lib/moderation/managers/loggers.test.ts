import { BanLoggerTypeManager, NicknameLoggerTypeManager } from '#lib/moderation/managers/loggers';
import type { LoggerTypeManager } from '#lib/moderation/managers/loggers/base/LoggerTypeManager';
import { container } from '@wolfstar/http-framework';
import { AuditLogEvent } from 'discord-api-types/v10';

describe('logger type managers', () => {
	const userId = '266624760782258186';
	const moderatorId = '254360814063058944';
	let canView = true;
	const manager = { guild: { id: '541738403230777351' }, canViewAuditLogs: async () => canView } as unknown as LoggerTypeManager.Manager;

	const getAuditLogs = vi.fn();
	let previous: unknown;

	beforeAll(() => {
		previous = (container as any).gatewayClient;
		(container as any).gatewayClient = { api: { guilds: { getAuditLogs } } };
	});

	afterAll(() => {
		(container as any).gatewayClient = previous;
	});

	beforeEach(() => {
		canView = true;
		getAuditLogs.mockReset();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function entry(id: string, targetId: string, changes: { key: string }[] = []) {
		// A Discord snowflake whose timestamp is now, so the entry is not older than the minute that is looked back:
		const snowflake = String((BigInt(Date.now() - 1420070400000) << 22n) + BigInt(id));
		return { id: snowflake, target_id: targetId, user_id: moderatorId, reason: 'because', changes };
	}

	test('GIVEN an entry the gateway gives while waiting THEN it resolves the wait with who did it', async () => {
		const bans = new BanLoggerTypeManager(manager);
		const waiting = bans.wait(userId);
		await vi.advanceTimersByTimeAsync(0);

		bans.setFromAuditLogs(userId, { userId: moderatorId, reason: 'spam' });

		await expect(waiting).resolves.toEqual({ userId: moderatorId, reason: 'spam' });
		expect(getAuditLogs).not.toHaveBeenCalled();
	});

	test('GIVEN no entry from the gateway THEN the audit log is read for the type of the manager', async () => {
		getAuditLogs.mockResolvedValue({ audit_log_entries: [entry('1', '1'), entry('2', userId)] });
		const bans = new BanLoggerTypeManager(manager);
		const waiting = bans.wait(userId);
		await vi.advanceTimersByTimeAsync(3000);

		await expect(waiting).resolves.toEqual({ userId: moderatorId, reason: 'because' });
		expect(getAuditLogs).toHaveBeenCalledWith('541738403230777351', { action_type: AuditLogEvent.MemberBanAdd }, { signal: undefined });
	});

	test('GIVEN a nickname manager THEN only an entry that changed the nickname is taken', async () => {
		getAuditLogs.mockResolvedValue({
			audit_log_entries: [entry('1', userId, [{ key: 'communication_disabled_until' }]), entry('2', userId, [{ key: 'nick' }])]
		});
		const nicknames = new NicknameLoggerTypeManager(manager);
		const waiting = nicknames.wait(userId);
		await vi.advanceTimersByTimeAsync(3000);

		await expect(waiting).resolves.toEqual({ userId: moderatorId, reason: 'because' });
	});

	test('GIVEN an audit log with no such change THEN nobody is returned', async () => {
		getAuditLogs.mockResolvedValue({ audit_log_entries: [entry('1', userId, [{ key: 'communication_disabled_until' }])] });
		const nicknames = new NicknameLoggerTypeManager(manager);
		const waiting = nicknames.wait(userId);
		await vi.advanceTimersByTimeAsync(3000);

		await expect(waiting).resolves.toBeNull();
	});

	test('GIVEN a bot that cannot view the audit log THEN it does not wait nor read it', async () => {
		canView = false;
		const bans = new BanLoggerTypeManager(manager);

		await expect(bans.wait(userId)).resolves.toBeNull();
		expect(getAuditLogs).not.toHaveBeenCalled();
	});
});
