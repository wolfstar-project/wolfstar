import { readSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { Events } from '#lib/types';
import { Colors } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder, userMention } from '@discordjs/builders';
import { isNullish } from '@sapphire/utilities';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';

@RegisterAsGatewayListener('guildMemberUpdate')
export class UserListener extends EventGatewayListener<'guildMemberUpdate'> {
	public async run(previous: GuildMember | null, next: GuildMember) {
		// Without the previous state of the member there is nothing to compare the nickname with:
		if (previous === null) return;

		const settings = await readSettings(next);
		const logChannelId = settings.logsMemberNicknameUpdate;
		if (isNullish(logChannelId)) return;

		// Send the Nickname log
		const prevNickname = previous.nickname;
		const nextNickname = next.nickname;
		if (prevNickname !== nextNickname) {
			const user = next.user ?? (await next.fetchUser());
			const guild = next.guild ?? (await next.fetchGuild());
			const t = await fetchGuildT(guild);

			// Who changed it, when the audit log has it and it was not the member themselves:
			const logger = await getLogger(guild);
			const context = await logger.nickname.wait(user.id).catch(() => null);
			const moderator = context !== null && context.userId !== user.id ? userMention(context.userId) : null;

			this.container.client.emit(Events.GuildMessageLog, guild, logChannelId, 'logsMemberNicknameUpdate', () =>
				new EmbedBuilder()
					.setColor(Colors.Yellow)
					.setAuthor(getFullEmbedAuthor(user))
					.setDescription(
						[
							this.getNameDescription(t, prevNickname, nextNickname),
							...(moderator === null ? [] : [t('events/guilds-logs:changedBy', { moderator })])
						].join('\n')
					)
					.setFooter({ text: t('events/guilds-members:nicknameUpdate') })
					.setTimestamp()
			);
		}
	}

	private getNameDescription(t: TFunction<AnyNamespace>, previousName: string | null, nextName: string | null) {
		return [
			previousName === null
				? t('events/guilds-members:nameUpdatePreviousWasNotSet')
				: t('events/guilds-members:nameUpdatePreviousWasSet', { previousName }),
			nextName === null ? t('events/guilds-members:nameUpdateNextWasNotSet') : t('events/guilds-members:nameUpdateNextWasSet', { nextName })
		].join('\n');
	}
}
