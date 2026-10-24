import { Serializer } from '#lib/database';

export class UserSerializer extends Serializer<string> {
	public async parse(input: string, { t, entry, guild }: Serializer.UpdateContext) {
		const role = await this.findRole(guild, input.trim());
		return role === null ? this.error(t('serializers:invalidRole', { name: entry.name })) : this.ok(role.id);
	}

	public async isValid(value: string, { t, entry, guild }: Serializer.UpdateContext): Promise<boolean> {
		if ((await this.fetchRole(guild, value)) !== null) return true;
		throw t('serializers:invalidRole', { name: entry.name });
	}

	public override async stringify(value: string, { guild }: Serializer.UpdateContext): Promise<string> {
		return (await this.fetchRole(guild, value))?.name ?? value;
	}
}
