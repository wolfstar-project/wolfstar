import type { ReadonlyGuildData } from 'wolfstar-database';
import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationShowCommand } from '#lib/moderation/structures/AutoModerationShowCommand';
import { translateKey } from '#lib/structures/commands/utils';
import { addAutomaticFields } from '#utils/functions';
import { chatInputApplicationCommandMention } from '@discordjs/builders';
import { inlineCode } from '@discordjs/formatters';
import { isNullishOrEmpty } from '@sapphire/utilities';
import type { TFunction } from '@wolfstar/plugin-i18next';

const Root = 'commands/auto-moderation';
const rule = AutoModerationRules.words;

/**
 * `/automod-words show`, which lists the filtered words on top of the common embed, see the `automod-words` parent
 * command.
 */
@AutoModerationShowCommand.register(rule)
export class UserCommand extends AutoModerationShowCommand {
	protected override showEnabled(t: TFunction, settings: ReadonlyGuildData) {
		const embed = super.showEnabled(t, settings);

		const words = settings.automodWordsList;
		if (isNullishOrEmpty(words)) {
			embed.addFields({
				name: translateKey(t, `${Root}:wordShowListTitleEmpty`),
				value: translateKey(t, `${Root}:wordShowListEmpty`, { command: this.#getAddMention() })
			});
		} else {
			addAutomaticFields(
				embed,
				translateKey(t, `${Root}:wordShowListTitle`, { count: words.length }),
				translateKey(t, `${Root}:wordShowList`, { words: words.map((word) => inlineCode(word)) })
			);
		}
		return embed;
	}

	/**
	 * Mentions `/automod-words add`, whose id is the one of the parent command.
	 */
	#getAddMention() {
		const id = this.container.stores.get('commands').get(rule.commandName)?.registry?.getGlobalId() ?? null;
		return id === null ? `/${rule.commandName} add` : chatInputApplicationCommandMention(rule.commandName, 'add', id);
	}
}
