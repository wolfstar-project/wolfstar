import { Serializer } from '#lib/database';
import type { Awaitable } from '@sapphire/utilities';
import { HoneypotActions, type HoneypotAction } from 'wolfstar-database';

export class UserSerializer extends Serializer<HoneypotAction> {
	public parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const value = input.trim().toLowerCase();
		const action = HoneypotActions.find((possible) => possible.toLowerCase() === value);
		return action === undefined
			? this.error(t('serializers:invalidHoneypotAction', { name: entry.name, possibles: HoneypotActions }))
			: this.ok(action);
	}

	public isValid(value: HoneypotAction): Awaitable<boolean> {
		return HoneypotActions.includes(value);
	}

	public override stringify(value: HoneypotAction, { t }: Serializer.UpdateContext): string {
		return t(`serializers:honeypotAction${value}`);
	}
}
