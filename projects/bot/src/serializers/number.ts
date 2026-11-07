import { Serializer } from '#lib/database';
import { ApplyOptions } from '@wolfstar/decorators';
import type { Awaitable } from '@sapphire/utilities';

type SerializerType = 'integer' | 'number' | 'float';

@ApplyOptions<Serializer.Options>({
	aliases: ['integer', 'float'] satisfies SerializerType[]
})
export class UserSerializer extends Serializer<number> {
	public parse(input: string, context: Serializer.UpdateContext) {
		const text = input.trim();
		const value = Number(text);

		if (context.entry.type === 'integer') {
			if (!/^[-+]?\d+$/.test(text) || !Number.isSafeInteger(value)) {
				return this.error(context.t('serializers:invalidInt', { name: context.entry.name }));
			}
		} else if (text === '' || !Number.isFinite(value)) {
			return this.error(context.t('serializers:invalidFloat', { name: context.entry.name }));
		}

		return this.minOrMax(value, value, context);
	}

	public isValid(value: number, context: Serializer.UpdateContext): Awaitable<boolean> {
		switch (context.entry.type as SerializerType) {
			case 'integer': {
				if (typeof value === 'number' && Number.isInteger(value) && this.minOrMax(value, value, context).isOk()) return true;
				throw context.t('serializers:invalidInt', { name: context.entry.name });
			}
			case 'number':
			case 'float': {
				if (typeof value === 'number' && !Number.isNaN(value) && this.minOrMax(value, value, context).isOk()) return true;
				throw context.t('serializers:invalidFloat', { name: context.entry.name });
			}
			default: {
				throw new Error('Unreachable');
			}
		}
	}
}
