import { Serializer, type ReactionRole } from '#lib/database';
import { getEmojiTextFormat, isValidSerializedEmoji } from '#utils/functions';
import { isObject, type Awaitable } from '@sapphire/utilities';

export class UserSerializer extends Serializer<ReactionRole> {
	public parse(_: string, { t }: Serializer.UpdateContext) {
		return this.error(t('serializers:unsupported'));
	}

	public isValid(value: ReactionRole, { t }: Serializer.UpdateContext): Awaitable<boolean> {
		if (
			isObject(value) &&
			Object.keys(value).length === 4 &&
			typeof value.emoji === 'string' &&
			isValidSerializedEmoji(value.emoji) &&
			(typeof value.message === 'string' || value.message === null) &&
			typeof value.channel === 'string' &&
			typeof value.role === 'string'
		)
			return true;

		throw t('serializers:reactionRoleInvalid');
	}

	public override async stringify(value: ReactionRole, { t, guild }: Serializer.UpdateContext): Promise<string> {
		const emoji = getEmojiTextFormat(value.emoji);
		const role = (await this.fetchRole(guild, value.role))?.name ?? t('serializers:unknownRole');
		const url = `https://discord.com/channels/${guild.id}/${value.channel}/${value.message}`;
		return `${emoji} | ${url} -> ${role}`;
	}
}
