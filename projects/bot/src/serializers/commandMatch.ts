import { CommandMatcher, Serializer } from '#lib/database';
import type { Awaitable } from '@sapphire/utilities';

export class UserSerializer extends Serializer<string> {
	public parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const match = CommandMatcher.resolve(input.trim());
		return match === null ? this.error(t('serializers:invalidCommand', { name: entry.name })) : this.ok(match);
	}

	public isValid(value: string, { t, entry }: Serializer.UpdateContext): Awaitable<boolean> {
		const command = CommandMatcher.resolve(value);
		if (!command) throw t('serializers:invalidCommand', { name: entry.name });
		return true;
	}

	public override stringify(value: string) {
		return (this.container.stores.get('commands').get(value) || { name: value }).name;
	}
}
