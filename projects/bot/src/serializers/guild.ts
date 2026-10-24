import { Serializer } from '#lib/database';

export class UserSerializer extends Serializer<string> {
	public async parse(input: string, context: Serializer.UpdateContext) {
		const value = input.trim();
		return (await this.fetchGuild(value)) === null
			? this.error(context.t('serializers:invalidGuild', { name: context.entry.name }))
			: this.ok(value);
	}

	public async isValid(value: string, { t, entry }: Serializer.UpdateContext): Promise<boolean> {
		if ((await this.fetchGuild(value)) === null) throw t('serializers:invalidGuild', { name: entry.name });
		return true;
	}

	public override async stringify(value: string): Promise<string> {
		return (await this.fetchGuild(value))?.name ?? value;
	}

	private async fetchGuild(id: string) {
		if (!/^\d{17,20}$/.test(id)) return null;
		return this.container.gatewayClient.guilds.resolve(id);
	}
}
