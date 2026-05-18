import { container } from '@sapphire/framework';

export interface CommandLogPayload {
	guildId: string | null;
	userId: string;
	userTag: string | null;
	commandName: string;
	subcommand: string | null;
	channelId: string | null;
	success: boolean;
	errorReason: string | null;
	latencyMs: number | null;
}

export function normalizeCommandError(err: unknown): string | null {
	if (err === null || err === undefined) return null;
	if (err instanceof Error) return err.message.slice(0, 2000);
	if (typeof err === 'string') return err.slice(0, 2000);
	try {
		return JSON.stringify(err).slice(0, 2000);
	} catch {
		return String(err).slice(0, 2000);
	}
}

export function writeCommandLog(payload: CommandLogPayload): void {
	if (payload.guildId === null) return;
	void container.prisma.commandLog
		.create({
			data: {
				guildId: payload.guildId,
				userId: payload.userId,
				userTag: payload.userTag,
				commandName: payload.commandName,
				subcommand: payload.subcommand,
				channelId: payload.channelId,
				success: payload.success,
				errorReason: payload.errorReason,
				executedAt: new Date(),
				latencyMs: payload.latencyMs,
				metadata: null
			}
		})
		.catch(() => null);
}
