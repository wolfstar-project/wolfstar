import { getLogger } from '#utils/functions/guild';
import { isNullish, isNullishOrEmpty } from '@sapphire/utilities';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildAuditLogsEntry } from '@wolfstar/plugin-gateway';
import { AuditLogEvent } from 'discord-api-types/v10';

@RegisterAsGatewayListener('guildAuditLogEntryCreate')
export class UserListener extends EventGatewayListener<'guildAuditLogEntryCreate'> {
	public override async run(entry: GuildAuditLogsEntry) {
		const guild = await this.container.gatewayClient.guilds.resolve(entry.guildId);
		if (!guild) return;

		switch (entry.action) {
			case AuditLogEvent.MemberUpdate:
				return this.#handleMemberUpdateTimeout(entry);
			case AuditLogEvent.MessageBulkDelete:
				(await getLogger(guild)).prune.setFromAuditLogs(entry.targetId!, { userId: entry.executorId! });
				break;
			default:
				break;
		}
	}

	async #handleMemberUpdateTimeout(entry: GuildAuditLogsEntry) {
		if (isNullishOrEmpty(entry.changes)) return;

		const change = entry.changes.find((change) => change.key === 'communication_disabled_until');
		if (isNullish(change)) return;

		(await getLogger(entry.guildId)).timeout.setFromAuditLogs(entry.targetId!, {
			userId: entry.executorId!,
			reason: entry.reason
		});
	}
}
