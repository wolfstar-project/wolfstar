import { Serializer } from '#lib/database';
import type { Awaitable } from '@sapphire/utilities';

export class UserSerializer extends Serializer<string> {
	public parse(input: string, context: Serializer.UpdateContext) {
		const value = input.trim();
		return this.minOrMax(value, value.length, context);
	}

	public isValid(value: string, context: Serializer.UpdateContext): Awaitable<boolean> {
		return typeof value === 'string' && this.minOrMax(value, value.length, context).isOk();
	}
}
