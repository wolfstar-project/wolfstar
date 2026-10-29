import { CommandMatcher, Serializer } from '#lib/database';
import { isDashboardAccessEntry, type PermissionsNode } from 'wolfstar-database';
import { isObject } from '@sapphire/utilities';

export class UserSerializer extends Serializer<PermissionsNode> {
	public parse(_: string, { t }: Serializer.UpdateContext) {
		return this.error(t('serializers:unsupported'));
	}

	public async isValid(value: PermissionsNode, { t, entry, guild }: Serializer.UpdateContext): Promise<boolean> {
		// Safe-guard checks against arbitrary data
		if (!isObject(value)) throw t('serializers:permissionNodeInvalid');
		// A dashboard access rule of wolfstar.rocks has a fourth key, `dashboard`, and names no command:
		const isRule = 'dashboard' in value;
		if (Object.keys(value).length !== (isRule ? 4 : 3)) throw t('serializers:permissionNodeInvalid');
		if (typeof value.id !== 'string') throw t('serializers:permissionNodeInvalid');
		if (!Array.isArray(value.allow)) throw t('serializers:permissionNodeInvalid');
		if (!Array.isArray(value.deny)) throw t('serializers:permissionNodeInvalid');
		if (isRule && (!isDashboardAccessEntry(value) || value.allow.length !== 0 || value.deny.length !== 0)) {
			throw t('serializers:permissionNodeInvalid');
		}

		// Check for target validity
		if (entry.property === 'permissionsRoles') {
			if ((await this.fetchRole(guild, value.id)) === null) throw t('serializers:permissionNodeInvalidTarget');
		} else {
			await this.container.gatewayClient.members.fetch(guild.id, value.id).catch(() => {
				throw t('serializers:permissionNodeInvalidTarget');
			});
		}

		// The @everyone role should not have allows, nor open the dashboard to everybody
		if (value.id === guild.id && (value.allow.length !== 0 || value.dashboard === 'allow')) {
			throw t('serializers:permissionNodeSecurityEveryoneAllows');
		}

		// The owner cannot have allows nor denies
		if (value.id === guild.ownerId) {
			throw t('serializers:permissionNodeSecurityOwner');
		}

		// Check all commands
		const checked = new Set<string>();
		for (const command of [...value.allow, ...value.deny]) {
			if (checked.has(command)) throw t('serializers:permissionNodeDuplicatedCommand', { command });

			const match = CommandMatcher.resolve(command);
			if (match === null) throw t('serializers:permissionNodeInvalidCommand', { command });
			checked.add(match);
		}

		return true;
	}

	public override stringify(value: PermissionsNode) {
		if (isDashboardAccessEntry(value)) return `${value.id}(dashboard: ${value.dashboard})`;
		return `${value.id}(${value.allow.join(', ')} | ${value.deny.join(', ')})`;
	}
}
