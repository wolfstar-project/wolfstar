import { normalizeCommandError, writeCommandLog, type CommandLogPayload } from '#root/listeners/commands/_command-log-shared';
import { container } from '@wolfstar/http-framework';

const basePayload: CommandLogPayload = {
	guildId: '1234567890',
	userId: '9876543210',
	commandName: 'ping',
	commandType: 'CHAT_INPUT',
	commandId: '1111222233334444',
	subcommand: null,
	channelId: '1111111111',
	success: true,
	errorReason: null,
	latencyMs: 50
};

describe('normalizeCommandError', () => {
	it('returns null for null input', () => {
		expect(normalizeCommandError(null)).toBeNull();
	});

	it('returns null for undefined input', () => {
		expect(normalizeCommandError(undefined)).toBeNull();
	});

	it('returns Error.message for Error instances', () => {
		const err = new Error('something went wrong');
		expect(normalizeCommandError(err)).toBe('something went wrong');
	});

	it('truncates Error.message to 2000 chars for very long messages', () => {
		const long = 'x'.repeat(3000);
		const err = new Error(long);
		const result = normalizeCommandError(err);
		expect(result).toHaveLength(2000);
		expect(result).toBe(long.slice(0, 2000));
	});

	it('returns the string itself for string input', () => {
		expect(normalizeCommandError('command failed')).toBe('command failed');
	});

	it('truncates strings to 2000 chars', () => {
		const long = 'y'.repeat(3000);
		const result = normalizeCommandError(long);
		expect(result).toHaveLength(2000);
		expect(result).toBe(long.slice(0, 2000));
	});

	it('returns JSON.stringify result for plain objects', () => {
		const obj = { code: 50013, message: 'Missing Permissions' };
		expect(normalizeCommandError(obj)).toBe(JSON.stringify(obj));
	});

	it('falls back to String() for circular objects where JSON.stringify throws', () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		const result = normalizeCommandError(circular);
		expect(result).toBe(String(circular).slice(0, 2000));
	});
});

describe('writeCommandLog', () => {
	let mockCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockCreate = vi.fn().mockResolvedValue({});
		Reflect.set(container, 'prisma', { orm: { public: { CommandLog: { create: mockCreate } } } });
	});

	it('skips the database write when guildId is null', () => {
		writeCommandLog({ ...basePayload, guildId: null });
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it('calls CommandLog.create with correct data when guildId is provided', () => {
		vi.useFakeTimers();
		const now = new Date('2026-01-01T00:00:00.000Z');
		vi.setSystemTime(now);

		writeCommandLog(basePayload);

		expect(mockCreate).toHaveBeenCalledOnce();
		expect(mockCreate).toHaveBeenCalledWith({
			id: expect.any(String),
			guildId: BigInt(basePayload.guildId!),
			userId: BigInt(basePayload.userId),
			commandName: basePayload.commandName,
			commandType: basePayload.commandType,
			commandId: BigInt(basePayload.commandId!),
			subcommand: basePayload.subcommand,
			channelId: BigInt(basePayload.channelId!),
			success: basePayload.success,
			errorReason: basePayload.errorReason,
			executedAt: now.toISOString(),
			latencyMs: basePayload.latencyMs,
			metadata: null
		});

		vi.useRealTimers();
	});

	it('gives every row its own id', () => {
		writeCommandLog(basePayload);
		writeCommandLog(basePayload);
		const [first, second] = mockCreate.mock.calls.map((call) => (call[0] as { id: string }).id);
		expect(first).not.toBe(second);
	});

	it('writes the optional columns as null when they are not given', () => {
		writeCommandLog({ guildId: basePayload.guildId, userId: basePayload.userId, commandName: 'ping', commandType: 'CONTEXT_MENU' });
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({ commandId: null, subcommand: null, channelId: null, success: true, errorReason: null, latencyMs: null })
		);
	});

	it('swallows database errors silently', async () => {
		mockCreate.mockRejectedValueOnce(new Error('DB down'));
		expect(() => writeCommandLog(basePayload)).not.toThrow();
		// Allow the rejected promise chain to settle so vitest can detect unhandled rejections
		await Promise.resolve();
		await Promise.resolve();
	});

	it('sets metadata to null always', () => {
		writeCommandLog(basePayload);
		expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ metadata: null }));
	});

	it('passes success: false and errorReason correctly', () => {
		const payload: CommandLogPayload = {
			...basePayload,
			success: false,
			errorReason: 'User not found'
		};
		writeCommandLog(payload);
		expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ success: false, errorReason: 'User not found' }));
	});
});
