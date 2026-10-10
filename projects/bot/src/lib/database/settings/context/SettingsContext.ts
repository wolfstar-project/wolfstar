import { AuditLogManager } from '#lib/database/settings/structures/AuditLogManager';
import { PermissionNodeManager } from '#lib/database/settings/structures/PermissionNodeManager';
import type { ReadonlyGuildData } from 'wolfstar-database';
import { isNullish } from '@sapphire/utilities';

export class SettingsContext {
	readonly #permissionNodes: PermissionNodeManager;
	#auditLog: AuditLogManager;

	public constructor(settings: ReadonlyGuildData) {
		this.#permissionNodes = new PermissionNodeManager(settings);
		this.#auditLog = new AuditLogManager(settings);
	}

	public get permissionNodes() {
		return this.#permissionNodes;
	}

	public get auditLog() {
		return this.#auditLog;
	}

	public update(settings: ReadonlyGuildData, data: Partial<ReadonlyGuildData>) {
		this.#auditLog.onPatch(settings);

		if (!isNullish(data.permissionsRoles) || !isNullish(data.permissionsUsers)) {
			this.#permissionNodes.refresh(settings);
		}
	}
}
