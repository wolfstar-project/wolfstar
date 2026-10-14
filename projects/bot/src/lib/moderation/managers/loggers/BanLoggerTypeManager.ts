import { LoggerTypeManager } from '#lib/moderation/managers/loggers/base/LoggerTypeManager';
import { AuditLogEvent } from 'discord-api-types/v10';

export class BanLoggerTypeManager extends LoggerTypeManager {
	public constructor(manager: LoggerTypeManager.Manager) {
		super(manager, AuditLogEvent.MemberBanAdd);
	}
}
