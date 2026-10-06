import { fetchUserReportEnabled, readSettings, readSettingsWordFilterRegExp } from '#lib/database';
import { ModerationMessageListener } from '#lib/moderation';
import { IncomingType, OutgoingType } from '#lib/moderation/workers';
import type { GuildMessage } from '#lib/types';
import { floatPromise } from '#common';
import { Colors } from '#utils/constants';
import { createLogMessage, deleteMessage } from '#utils/functions';
import { getContent } from '#utils/util';
import { codeBlock, cutText } from '@sapphire/utilities';
import { ApplyOptions } from '@wolfstar/decorators';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';

@ApplyOptions<ModerationMessageListener.Options>({
	emitter: 'client',
	reasonLanguageKey: 'events/moderation:words',
	reasonLanguageKeyWithMaximum: 'events/moderation:wordsWithMaximum',
	keyEnabled: 'automodWordsEnabled',
	ignoredChannelsPath: 'automodWordsIgnoredChannels',
	ignoredRolesPath: 'automodWordsIgnoredRoles',
	softPunishmentPath: 'automodWordsSoftAction',
	hardPunishmentPath: {
		action: 'automodWordsHardAction',
		actionDuration: 'automodWordsHardActionDuration',
		adder: 'words'
	}
})
export class UserModerationMessageListener extends ModerationMessageListener<FilterResults> {
	protected async preProcess(message: GuildMessage): Promise<FilterResults | null> {
		const content = getContent(message);
		if (content === null) return null;

		const settings = await readSettings(message.guildId);
		const regExp = readSettingsWordFilterRegExp(settings);
		if (regExp === null) return null;

		const result = await this.container.workers.send({ type: IncomingType.RunRegExp, regExp, content }, 500);
		return result.type === OutgoingType.RegExpMatch ? result : null;
	}

	protected async onDelete(message: GuildMessage, t: TFunction<AnyNamespace>, value: FilterResults) {
		floatPromise(deleteMessage(message));
		if (message.content.length > 25 && (await fetchUserReportEnabled(message.author.id))) {
			await message.author.send(t('events/moderation:wordFilterDm', { filtered: codeBlock('md', cutText(value.filtered, 1900)) }));
		}
	}

	protected onAlert(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return this.sendAlert(message, t, 'events/moderation:wordFilter');
	}

	protected async onLogMessage(message: GuildMessage, t: TFunction<AnyNamespace>, results: FilterResults) {
		return createLogMessage({
			color: Colors.Red,
			author: message.author.toJSON(),
			content: cutText(results.highlighted, 4000),
			footer: `#${await this.fetchChannelName(message)} | ${t('events/moderation:wordFilterFooter')}`
		});
	}
}

interface FilterResults {
	filtered: string;
	highlighted: string;
}
