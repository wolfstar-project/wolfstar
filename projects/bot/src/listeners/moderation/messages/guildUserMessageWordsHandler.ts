import { fetchUserReportEnabled } from '#lib/database';
import { getAutoModerationRuleWordFilter } from '#lib/moderation/automod/rules';
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
import type { AutoModerationRule } from 'wolfstar-database';

@ApplyOptions<ModerationMessageListener.Options<'Words'>>({
	emitter: 'client',
	type: 'Words',
	reasonLanguageKey: 'events/moderation:words',
	reasonLanguageKeyWithMaximum: 'events/moderation:wordsWithMaximum'
})
export class UserModerationMessageListener extends ModerationMessageListener<FilterResults, 'Words'> {
	protected async preProcess(message: GuildMessage, rule: AutoModerationRule<'Words'>): Promise<FilterResults | null> {
		const content = getContent(message);
		if (content === null) return null;

		const regExp = getAutoModerationRuleWordFilter(rule);
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
