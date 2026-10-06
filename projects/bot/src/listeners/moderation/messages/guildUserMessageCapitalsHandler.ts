import { fetchUserReportEnabled, readSettings } from '#lib/database';
import { ModerationMessageListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { floatPromise } from '#common';
import { Colors } from '#utils/constants';
import { deleteMessage } from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { codeBlock, cutText } from '@sapphire/utilities';
import { getCode, isUpper } from '@skyra/char';
import { ApplyOptions } from '@wolfstar/decorators';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';

@ApplyOptions<ModerationMessageListener.Options>({
	emitter: 'client',
	reasonLanguageKey: 'events/moderation:capitals',
	reasonLanguageKeyWithMaximum: 'events/moderation:capitalsWithMaximum',
	keyEnabled: 'automodCapitalsEnabled',
	ignoredChannelsPath: 'automodCapitalsIgnoredChannels',
	ignoredRolesPath: 'automodCapitalsIgnoredRoles',
	softPunishmentPath: 'automodCapitalsSoftAction',
	hardPunishmentPath: {
		action: 'automodCapitalsHardAction',
		actionDuration: 'automodCapitalsHardActionDuration',
		adder: 'capitals'
	}
})
export class UserModerationMessageListener extends ModerationMessageListener<number> {
	protected async preProcess(message: GuildMessage): Promise<1 | null> {
		if (message.content.length === 0) return null;

		const settings = await readSettings(message.guildId);
		if (message.content.length < settings.automodCapitalsMinimum) return null;

		let length = 0;
		let count = 0;

		for (const char of message.content) {
			const charCode = getCode(char);
			if (isUpper(charCode)) count++;
			length++;
		}

		const percentage = (count / length) * 100;
		return percentage >= settings.automodCapitalsMaximum ? 1 : null;
	}

	protected async onDelete(message: GuildMessage, t: TFunction<AnyNamespace>) {
		floatPromise(deleteMessage(message));
		if (message.content.length > 25 && (await fetchUserReportEnabled(message.author.id))) {
			await message.author.send(t('events/moderation:capsFilterDm', { message: codeBlock('md', cutText(message.content, 1900)) }));
		}
	}

	protected onAlert(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return this.sendAlert(message, t, 'events/moderation:capsFilter');
	}

	protected async onLogMessage(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return new EmbedBuilder()
			.setDescription(message.content)
			.setColor(Colors.Red)
			.setAuthor(getFullEmbedAuthor(message.author, message.url))
			.setFooter({ text: `#${await this.fetchChannelName(message)} | ${t('events/moderation:capsFilterFooter')}` })
			.setTimestamp();
	}
}
