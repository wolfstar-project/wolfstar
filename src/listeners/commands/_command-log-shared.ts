import { readSettings, readSettingsAuditLog } from '#lib/database';
import { container } from '@sapphire/framework';

export interface CommandExecuteAuditPayload {
	guildId: string;
	actorId: string;
	commandName: string;
	commandId?: string;
	commandType: 'chat-input' | 'context-menu' | 'message';
	channelId: string;
}

export function recordCommandExecuteAudit(payload: CommandExecuteAuditPayload): void {
	void (async () => {
		const settings = await readSettings(payload.guildId);
		await readSettingsAuditLog(settings).command(payload.actorId, {
			commandName: payload.commandName,
			commandId: payload.commandId,
			commandType: payload.commandType,
			channelId: payload.channelId
		});
	})().catch(() => null);
}

export interface CommandLogPayload {
	guildId: string | null;
	userId: string;
	commandName: string;
	commandType: string;
	commandId?: string | null;
	subcommand?: string | null;
	channelId?: string | null;
	success?: boolean;
	errorReason?: string | null;
	latencyMs?: number | null;
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
				commandName: payload.commandName,
				commandType: payload.commandType,
				commandId: payload.commandId,
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
