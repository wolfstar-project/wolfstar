import { ModerationMessageListener } from '#lib/moderation/structures/ModerationMessageListener';
import type { GuildMessage } from '#lib/types';
import { Colors } from '#utils/constants';
import { deleteMessage } from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { cutText } from '@sapphire/utilities';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { AutoModerationRule } from 'wolfstar-database';

/**
 * The base of the listeners of the rules that only say whether a message infringes them: the message is deleted, the
 * member alerted and the message logged the same way for all of them, with the keys named after the type of the rule
 * (`events/moderation:rule<Type>`, `…WithMaximum`, `…Alert` and `…Footer`).
 *
 * @example
 * ```typescript
 * export class UserListener extends AutoModerationRuleListener<'Spoilers'> {
 * 	public constructor(context: AutoModerationRuleListener.LoaderContext) {
 * 		super(context, 'Spoilers');
 * 	}
 *
 * 	protected detect(message: GuildMessage) {
 * 		return hasSpoiler(message.content);
 * 	}
 * }
 * ```
 */
export abstract class AutoModerationRuleListener<Type extends ModerationMessageListener.NamedRuleType> extends ModerationMessageListener<1, Type> {
	readonly #type: Type;

	public constructor(context: ModerationMessageListener.LoaderContext, type: Type) {
		super(context, {
			emitter: 'client',
			type,
			reasonLanguageKey: `events/moderation:rule${type}`,
			reasonLanguageKeyWithMaximum: `events/moderation:rule${type}WithMaximum`
		});
		this.#type = type;
	}

	/**
	 * Whether a message infringes a rule.
	 *
	 * @param message - A message a member sent.
	 * @param rule - An enabled rule of the type of the listener, which the member and the channel are not exempt from.
	 */
	protected abstract detect(message: GuildMessage, rule: AutoModerationRule<Type>): boolean;

	protected preProcess(message: GuildMessage, rule: AutoModerationRule<Type>): 1 | null {
		return this.detect(message, rule) ? 1 : null;
	}

	protected onDelete(message: GuildMessage) {
		return deleteMessage(message);
	}

	protected onAlert(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return this.sendAlert(message, t, `events/moderation:rule${this.#type}Alert`);
	}

	protected async onLogMessage(message: GuildMessage, t: TFunction<AnyNamespace>) {
		const footer = (t as unknown as (key: string) => string)(`events/moderation:rule${this.#type}Footer`);
		return (
			new EmbedBuilder()
				// A message that only holds attachments or stickers has no content, and an embed takes no empty description:
				.setDescription(message.content ? cutText(message.content, 4000) : null)
				.setColor(Colors.Red)
				.setAuthor(getFullEmbedAuthor(message.author, message.url))
				.setFooter({ text: `#${await this.fetchChannelName(message)} | ${footer}` })
				.setTimestamp()
		);
	}
}

export declare namespace AutoModerationRuleListener {
	type LoaderContext = ModerationMessageListener.LoaderContext;
}
