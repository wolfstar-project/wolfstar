import { Serializer } from '#lib/database';
import { getTag } from '#utils/util';

export class UserSerializer extends Serializer<string> {
	public async parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const id = /^(?:<@!?)?(\d{17,20})>?$/.exec(input.trim())?.[1];
		if (id && (await this.fetchUser(id)) !== null) return this.ok(id);
		return this.error(t('serializers:invalidUser', { name: entry.name }));
	}

	public async isValid(value: string, { t, entry }: Serializer.UpdateContext): Promise<boolean> {
		if (/^\d{17,20}$/.test(value) && (await this.fetchUser(value)) !== null) return true;
		throw t('serializers:invalidUser', { name: entry.name });
	}

	public override async stringify(value: string): Promise<string> {
		const user = await this.fetchUser(value);
		return user === null ? value : getTag(user);
	}

	private fetchUser(id: string) {
		return this.container.gatewayClient.users.fetch(id).catch(() => null);
	}
}
