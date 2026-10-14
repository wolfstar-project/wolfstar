import { getLogger } from '#utils/functions/guild';
import { isNullish, isNullishOrEmpty } from '@sapphire/utilities';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildAuditLogsEntry } from '@wolfstar/plugin-gateway';
import { AuditLogEvent } from 'discord-api-types/v10';

/**
 * Hands the audit log entries to the logger managers, which pass who did what to the listener that waits for it.
 */
@RegisterAsGatewayListener('guildAuditLogEntryCreate')
export class UserListener extends EventGatewayListener<'guildAuditLogEntryCreate'> {
	public override async run(entry: GuildAuditLogsEntry) {
		const guild = await this.container.gatewayClient.guilds.resolve(entry.guildId);
		if (!guild) return;

		// An entry with no target or no executor has nobody a log could say it was done by:
		if (isNullish(entry.targetId) || isNullish(entry.executorId)) return;

		const logger = await getLogger(guild);
		const context = { userId: entry.executorId, reason: entry.reason };
		switch (entry.action) {
			case AuditLogEvent.MemberUpdate:
				return this.#handleMemberUpdate(logger, entry, context);
			case AuditLogEvent.MemberBanAdd:
				return logger.ban.setFromAuditLogs(entry.targetId, context);
			case AuditLogEvent.MemberBanRemove:
				return logger.unban.setFromAuditLogs(entry.targetId, context);
			case AuditLogEvent.MemberKick:
				return logger.kick.setFromAuditLogs(entry.targetId, context);
			case AuditLogEvent.RoleUpdate:
				return logger.roleUpdate.setFromAuditLogs(entry.targetId, context);
			case AuditLogEvent.MessageBulkDelete:
				return logger.prune.setFromAuditLogs(entry.targetId, { userId: entry.executorId });
			default:
				break;
		}
	}

	#handleMemberUpdate(
		logger: Awaited<ReturnType<typeof getLogger>>,
		entry: GuildAuditLogsEntry,
		context: { userId: string; reason?: string | null }
	) {
		if (isNullishOrEmpty(entry.changes)) return;

		if (entry.changes.some((change) => change.key === 'communication_disabled_until')) {
			logger.timeout.setFromAuditLogs(entry.targetId!, context);
		}

		if (entry.changes.some((change) => change.key === 'nick')) {
			logger.nickname.setFromAuditLogs(entry.targetId!, context);
		}
	}
}
