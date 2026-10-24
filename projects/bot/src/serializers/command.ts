import { Serializer } from '#lib/database';
import type { Awaitable } from '@sapphire/utilities';

export class UserSerializer extends Serializer<string> {
	public parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const command = this.container.stores.get('commands').get(input.trim().toLowerCase());
		return command ? this.ok(command.name) : this.error(t('serializers:invalidCommand', { name: entry.name }));
	}

	public isValid(value: string, { t, entry }: Serializer.UpdateContext): Awaitable<boolean> {
		const command = this.container.stores.get('commands').has(value);
		if (!command) throw t('serializers:invalidCommand', { name: entry.name });
		return true;
	}

	public override stringify(value: string) {
		return (this.container.stores.get('commands').get(value) || { name: value }).name;
	}
}
