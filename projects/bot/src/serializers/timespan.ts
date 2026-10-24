import { Serializer } from '#lib/database';
import { resolveTimeSpan } from '#utils/resolvers';
import type { Awaitable } from '@sapphire/utilities';

export class UserSerializer extends Serializer<number> {
	public parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const parameter = input.trim();
		const result = resolveTimeSpan(parameter, { minimum: entry.minimum ?? undefined, maximum: entry.maximum ?? undefined });
		return result.match({
			ok: (value) => this.ok(value),
			err: (key) => this.error(t(key, { parameter, minimum: entry.minimum, maximum: entry.maximum }))
		});
	}

	public isValid(value: number, context: Serializer.UpdateContext): Awaitable<boolean> {
		if (typeof value === 'number' && Number.isInteger(value) && this.minOrMax(value, value, context).isOk()) return true;
		throw context.t('serializers:invalidInt', { name: context.entry.name });
	}

	public override stringify(data: number, { t }: Serializer.UpdateContext): string {
		return t('globals:durationValue', { value: data });
	}
}
