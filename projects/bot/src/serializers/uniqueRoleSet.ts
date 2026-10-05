import { Serializer } from '#lib/database';
import { type UniqueRoleSet } from 'wolfstar-database';
import { isObject } from '@sapphire/utilities';

export class UserSerializer extends Serializer<UniqueRoleSet> {
	/**
	 * Parses `name role role…`: the name of the set, then the roles as mentions or IDs.
	 */
	public async parse(input: string, { t, entry, guild }: Serializer.UpdateContext) {
		const [name, ...parts] = input.trim().split(/\s+/);
		if (!name || parts.length === 0) return this.error(t('serializers:uniqueRoleSetInvalid'));

		const roles: string[] = [];
		for (const part of parts) {
			const role = await this.findRole(guild, part);
			if (role === null) return this.error(t('serializers:invalidRole', { name: entry.name }));
			roles.push(role.id);
		}

		return this.ok({ name, roles });
	}

	public async isValid(value: UniqueRoleSet, { t, guild }: Serializer.UpdateContext): Promise<boolean> {
		if (isObject(value) && Object.keys(value).length === 2 && typeof value.name === 'string' && Array.isArray(value.roles)) {
			const roles = await Promise.all(value.roles.map((role) => (typeof role === 'string' ? this.fetchRole(guild, role) : null)));
			if (roles.every((role) => role !== null)) return true;
		}

		throw t('serializers:uniqueRoleSetInvalid');
	}

	public override async stringify(value: UniqueRoleSet, { t, guild }: Serializer.UpdateContext): Promise<string> {
		const roles = await Promise.all(value.roles.map(async (role) => (await this.fetchRole(guild, role))?.name ?? t('serializers:unknownRole')));
		return `[${value.name} -> \`${roles.join('` | `')}\`]`;
	}

	public override equals(left: UniqueRoleSet, right: UniqueRoleSet): boolean {
		return left.name === right.name;
	}
}
