import { Serializer } from '#lib/database';
import type { Awaitable } from '@sapphire/utilities';
import { MessageUpdateStyles, type MessageUpdateStyle } from 'wolfstar-database';

export class UserSerializer extends Serializer<MessageUpdateStyle> {
	public parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const value = input.trim().toLowerCase();
		const style = MessageUpdateStyles.find((possible) => possible.toLowerCase() === value);
		return style === undefined
			? this.error(t('serializers:invalidMessageUpdateStyle', { name: entry.name, possibles: MessageUpdateStyles }))
			: this.ok(style);
	}

	public isValid(value: MessageUpdateStyle): Awaitable<boolean> {
		return MessageUpdateStyles.includes(value);
	}

	public override stringify(value: MessageUpdateStyle, { t }: Serializer.UpdateContext): string {
		return t(`serializers:messageUpdateStyle${value}`);
	}
}
