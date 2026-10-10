import { Serializer } from '#lib/database';
import { getEmojiObject, getEmojiString, getEmojiTextFormat, isValidSerializedEmoji } from '#utils/functions';
import type { SerializedEmoji } from 'wolfstar-database';
import type { Awaitable } from '@sapphire/utilities';

export class UserSerializer extends Serializer<SerializedEmoji> {
	public parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const emoji = getEmojiObject(input.trim());
		return emoji === null ? this.error(t('serializers:invalidEmoji', { name: entry.name })) : this.ok(getEmojiString(emoji));
	}

	public isValid(value: SerializedEmoji, { t, entry }: Serializer.UpdateContext): Awaitable<boolean> {
		if (isValidSerializedEmoji(value)) return true;
		throw new Error(t('serializers:invalidEmoji', { name: entry.name }));
	}

	public override stringify(data: SerializedEmoji) {
		return getEmojiTextFormat(data);
	}
}
