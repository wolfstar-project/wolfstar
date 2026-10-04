import { Serializer } from '#lib/database';
import { type StickyRole } from 'wolfstar-database';
import { isObject } from '@sapphire/utilities';

export class UserSerializer extends Serializer<StickyRole> {
	public parse(_: string, { t }: Serializer.UpdateContext) {
		return this.error(t('serializers:unsupported'));
	}

	public async isValid(value: StickyRole, { t, guild }: Serializer.UpdateContext): Promise<boolean> {
		if (isObject(value) && Object.keys(value).length === 2 && typeof value.user === 'string' && Array.isArray(value.roles)) {
			const roles = await Promise.all(value.roles.map((role) => (typeof role === 'string' ? this.fetchRole(guild, role) : null)));
			if (roles.every((role) => role !== null)) return true;
		}

		throw t('serializers:stickyRoleInvalid');
	}

	public override async stringify(value: StickyRole, { t, guild }: Serializer.UpdateContext): Promise<string> {
		const user = await this.container.gatewayClient.users.fetch(value.user).catch(() => null);
		const roles = await Promise.all(value.roles.map(async (role) => (await this.fetchRole(guild, role))?.name ?? t('serializers:unknownRole')));
		return `[${user?.username ?? t('serializers:unknownUser')} -> ${roles}]`;
	}
}
