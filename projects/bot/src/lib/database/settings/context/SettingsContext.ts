import { AdderManager } from '#lib/database/settings/structures/AdderManager';
import { AuditLogManager } from '#lib/database/settings/structures/AuditLogManager';
import { PermissionNodeManager } from '#lib/database/settings/structures/PermissionNodeManager';
import type { ReadonlyGuildData } from '#lib/database/settings/types';
import { create } from '#utils/Security/RegexCreator';
import { RateLimitManager } from '@sapphire/ratelimits';
import { isNullish, isNullishOrEmpty } from '@sapphire/utilities';

export class SettingsContext {
	readonly #adders: AdderManager;
	readonly #permissionNodes: PermissionNodeManager;
	#auditLog: AuditLogManager;
	#wordFilterRegExp: RegExp | null;
	#noMentionSpam: RateLimitManager;

	public constructor(settings: ReadonlyGuildData) {
		this.#adders = new AdderManager(settings);
		this.#permissionNodes = new PermissionNodeManager(settings);
		this.#auditLog = new AuditLogManager(settings);
		this.#wordFilterRegExp = isNullishOrEmpty(settings.selfmodWordsList) ? null : new RegExp(create(settings.selfmodWordsList), 'gi');
		this.#noMentionSpam = new RateLimitManager(settings.noMentionSpamTimePeriod * 1000, settings.noMentionSpamMentionsAllowed);
	}

	public get adders() {
		return this.#adders;
	}

	public get permissionNodes() {
		return this.#permissionNodes;
	}

	public get auditLog() {
		return this.#auditLog;
	}

	public get wordFilterRegExp() {
		return this.#wordFilterRegExp;
	}

	public get noMentionSpam() {
		return this.#noMentionSpam;
	}

	public update(settings: ReadonlyGuildData, data: Partial<ReadonlyGuildData>) {
		this.#adders.onPatch(settings);
		this.#auditLog.onPatch(settings);

		if (!isNullish(data.permissionsRoles) || !isNullish(data.permissionsUsers)) {
			this.#permissionNodes.refresh(settings);
		}

		if (!isNullish(data.noMentionSpamTimePeriod) || !isNullish(data.noMentionSpamMentionsAllowed)) {
			this.#noMentionSpam = new RateLimitManager(settings.noMentionSpamTimePeriod * 1000, settings.noMentionSpamMentionsAllowed);
		}

		if (!isNullish(data.selfmodWordsList)) {
			this.#wordFilterRegExp = isNullishOrEmpty(settings.selfmodWordsList) ? null : new RegExp(create(settings.selfmodWordsList), 'gi');
		}
	}
}
