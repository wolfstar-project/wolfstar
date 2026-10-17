import { Serializer } from '#lib/database';
import type { Awaitable } from '@sapphire/utilities';

const TrueOptions = new Set(['true', 't', 'yes', 'y', 'on', 'enable', 'enabled', '1', '+']);
const FalseOptions = new Set(['false', 'f', 'no', 'n', 'off', 'disable', 'disabled', '0', '-']);

export class UserSerializer extends Serializer<boolean> {
	public parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const value = input.trim().toLowerCase();
		if (TrueOptions.has(value)) return this.ok(true);
		if (FalseOptions.has(value)) return this.ok(false);
		return this.error(t('serializers:invalidBool', { name: entry.name }));
	}

	public isValid(value: boolean): Awaitable<boolean> {
		return typeof value === 'boolean';
	}

	public override stringify(value: boolean, { t }: Serializer.UpdateContext): string {
		return t(value ? 'arguments:booleanEnabled' : 'arguments:booleanDisabled');
	}
}
