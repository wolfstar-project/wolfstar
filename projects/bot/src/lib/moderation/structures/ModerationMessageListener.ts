import { readSettings } from '#lib/database';
import { addAutoModerationRuleStrike, getAutoModerationRuleAdder, readAutoModerationRules } from '#lib/moderation/automod/rules';
import type { AdderError } from '#lib/database/utils/Adder';
import { ModerationActions } from '#lib/moderation/actions/index';
import { fetchGuildT } from '#lib/moderation/common';
import { AutoModerationOnInfraction } from '#lib/moderation/structures/AutoModerationOnInfraction';
import { Events } from '#lib/types/Enums';
import type { GuildMessage } from '#lib/types';
import { floatPromise, minutes, resolveGuild, seconds } from '#common';
import { deleteMessage, getModeration, isModerator } from '#utils/functions';
import type { createLogMessage } from '#utils/functions';
import type { EmbedBuilder } from '@discordjs/builders';
import { isNullishOrZero, type Awaitable, type Nullish } from '@sapphire/utilities';
import { Listener } from '@wolfstar/http-framework';
import { canSendMessages, isTextBasedChannel } from '@wolfstar/http-framework-utilities/gateway';
import type { Message } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import { resolveAutoModerationRulePunishment, type AutoModerationRule, type AutoModerationRuleType } from 'wolfstar-database';

/**
 * The base of the listeners that run the auto-moderation rules of a type on the messages the members send
 * (`src/listeners/moderation/messages`), which all listen to {@linkcode Events.GuildUserMessage}.
 *
 * @remarks
 *
 * A guild has as many rules of a type as it wants. They are tried oldest first, and the first one the message
 * infringes ({@linkcode ModerationMessageListener.preProcess} returns a value) is the only one applied: its soft
 * actions (delete, alert, log), then the infraction is added to its threshold, and its hard action is taken once the
 * threshold is reached, or right away when the rule has none.
 */
export abstract class ModerationMessageListener<T = unknown, Type extends AutoModerationRuleType = AutoModerationRuleType> extends Listener {
	private readonly type: Type;
	private readonly reasonLanguageKey: ModerationMessageListener.ReasonKey;
	private readonly reasonLanguageKeyWithMaximum: `${ModerationMessageListener.ReasonKey}WithMaximum`;

	public constructor(context: ModerationMessageListener.LoaderContext, options: ModerationMessageListener.Options<Type>) {
		super(context, { ...options, event: Events.GuildUserMessage });

		this.type = options.type;
		this.reasonLanguageKey = options.reasonLanguageKey;
		this.reasonLanguageKeyWithMaximum = options.reasonLanguageKeyWithMaximum;
	}

	public async run(message: GuildMessage) {
		const rules = (await readAutoModerationRules(message.guildId)).filter(
			(rule): rule is AutoModerationRule<Type> => rule.type === this.type && rule.enabled && this.checkRule(rule, message)
		);
		if (rules.length === 0) return;

		// Without the member the roles and the moderator level cannot be checked, so nobody is moderated by guess:
		const { member } = message;
		if (member === null || (await isModerator(member))) return;

		for (const rule of rules) {
			const preProcessed = await this.preProcess(message, rule);
			if (preProcessed === null) continue;

			// One rule per message: a second one of the same type would delete and punish for the same thing again.
			return this.processInfraction(message, rule, preProcessed);
		}
	}

	protected async processInfraction(message: GuildMessage, rule: AutoModerationRule<Type>, preProcessed: T) {
		const settings = await readSettings(message.guildId);

		const logChannelId = settings.moderationChannel;
		const t = await fetchGuildT({ id: message.guildId });
		await this.processSoftPunishment(message, logChannelId, t, rule.softAction, preProcessed);

		const adder = getAutoModerationRuleAdder(rule);
		if (!adder) return this.processHardPunishment(message, rule, t, 0, 0);

		const points = typeof preProcessed === 'number' ? preProcessed : 1;
		try {
			adder.add(message.author.id, points);
		} catch (error) {
			await this.processHardPunishment(message, rule, t, (error as AdderError).amount, adder.maximum);
		}
	}

	protected async processSoftPunishment(
		message: GuildMessage,
		logChannelId: string | Nullish,
		language: TFunction<AnyNamespace>,
		bitfield: number,
		preProcessed: T
	) {
		if (AutoModerationOnInfraction.has(bitfield, AutoModerationOnInfraction.flags.Delete) && (await message.deletable)) {
			floatPromise(this.onDelete(message, language, preProcessed));
		}

		if (
			AutoModerationOnInfraction.has(bitfield, AutoModerationOnInfraction.flags.Alert) &&
			(await canSendMessages(await message.fetchChannel()))
		) {
			floatPromise(this.onAlert(message, language, preProcessed));
		}

		if (AutoModerationOnInfraction.has(bitfield, AutoModerationOnInfraction.flags.Log)) {
			floatPromise(this.onLog(message, logChannelId, language, preProcessed));
		}
	}

	protected async processHardPunishment(
		message: GuildMessage,
		rule: AutoModerationRule<Type>,
		language: TFunction<AnyNamespace>,
		points: number,
		maximum: number
	) {
		// A member who keeps reaching the threshold moves up the escalation of the rule:
		const strikes = await addAutoModerationRuleStrike(rule, message.author.id);
		const { action, duration } = resolveAutoModerationRulePunishment(rule, strikes);
		switch (action) {
			case 'Warning':
				await this.onWarning(message, language, points, maximum, duration);
				break;
			case 'Kick':
				await this.onKick(message, language, points, maximum);
				break;
			case 'Timeout':
				await this.onTimeout(message, language, points, maximum, duration);
				break;
			case 'Mute':
				await this.onMute(message, language, points, maximum, duration);
				break;
			case 'Softban':
				await this.onSoftBan(message, language, points, maximum);
				break;
			case 'Ban':
				await this.onBan(message, language, points, maximum, duration);
				break;
			case 'VoiceKick':
				await this.onVoiceKick(message, language, points, maximum);
				break;
		}
	}

	protected async onWarning(message: GuildMessage, t: TFunction<AnyNamespace>, points: number, maximum: number, duration: number | null) {
		await this.createActionAndSend(message, async () =>
			ModerationActions.warning.apply(await this.fetchGuild(message), {
				user: message.author,
				reason: this.#getReason(t, points, maximum),
				duration
			})
		);
	}

	protected async onKick(message: GuildMessage, t: TFunction<AnyNamespace>, points: number, maximum: number) {
		await this.createActionAndSend(message, async () =>
			ModerationActions.kick.apply(await this.fetchGuild(message), { user: message.author, reason: this.#getReason(t, points, maximum) })
		);
	}

	protected async onTimeout(message: GuildMessage, t: TFunction<AnyNamespace>, points: number, maximum: number, duration: number | null) {
		if (isNullishOrZero(duration)) return;
		await this.createActionAndSend(message, async () =>
			ModerationActions.timeout.apply(await this.fetchGuild(message), {
				user: message.author,
				reason: this.#getReason(t, points, maximum),
				duration
			})
		);
	}

	protected async onMute(message: GuildMessage, t: TFunction<AnyNamespace>, points: number, maximum: number, duration: number | null) {
		await this.createActionAndSend(message, async () =>
			ModerationActions.mute.apply(await this.fetchGuild(message), {
				user: message.author,
				reason: this.#getReason(t, points, maximum),
				duration
			})
		);
	}

	protected async onSoftBan(message: GuildMessage, t: TFunction<AnyNamespace>, points: number, maximum: number) {
		await this.createActionAndSend(message, async () =>
			ModerationActions.softban.apply(
				await this.fetchGuild(message),
				{ user: message.author, reason: this.#getReason(t, points, maximum) },
				{ context: seconds.fromMinutes(5) }
			)
		);
	}

	protected async onBan(message: GuildMessage, t: TFunction<AnyNamespace>, points: number, maximum: number, duration: number | null) {
		await this.createActionAndSend(message, async () =>
			ModerationActions.ban.apply(await this.fetchGuild(message), {
				user: message.author,
				reason: this.#getReason(t, points, maximum),
				duration
			})
		);
	}

	protected async onVoiceKick(message: GuildMessage, t: TFunction<AnyNamespace>, points: number, maximum: number) {
		await this.createActionAndSend(message, async () =>
			ModerationActions.voiceKick.apply(await this.fetchGuild(message), {
				user: message.author,
				reason: this.#getReason(t, points, maximum)
			})
		);
	}

	protected async createActionAndSend(message: GuildMessage, performAction: () => unknown): Promise<void> {
		const unlock = (await getModeration(message.guildId)).createLock();
		await performAction();
		unlock();
	}

	protected async onLog(message: GuildMessage, logChannelId: string | Nullish, language: TFunction<AnyNamespace>, value: T): Promise<void> {
		this.container.client.emit(
			Events.GuildMessageLog,
			await this.fetchGuild(message),
			logChannelId,
			'moderationChannel',
			this.onLogMessage.bind(this, message, language, value)
		);
	}

	/**
	 * The guild a message was sent in, from the message when the gateway resolved it, from the cache otherwise.
	 *
	 * @param message - The message to get the guild of.
	 */
	protected async fetchGuild(message: GuildMessage) {
		return message.guild ?? (await resolveGuild(message.guildId));
	}

	/**
	 * The name of the channel a message was sent in, for the footer of the logs.
	 *
	 * @param message - The message to get the name of the channel of.
	 */
	protected async fetchChannelName(message: GuildMessage): Promise<string> {
		const channel = await message.fetchChannel();
		return ('name' in channel ? channel.name : null) ?? message.channelId;
	}

	/**
	 * Sends a message to the channel of a message, and deletes it once the timer is up.
	 *
	 * @remarks
	 *
	 * This is what `sendTemporaryMessage(message, content)` did before the commands became interactions, the function
	 * of `#utils/functions` replies to an interaction now.
	 *
	 * @param message - The message whose channel the content is sent to.
	 * @param content - The content of the message, in which nobody is pinged.
	 * @param timer - The time after which the message is deleted.
	 */
	protected async sendTemporaryMessage(message: GuildMessage, content: string, timer = minutes(1)): Promise<Message | null> {
		const channel = await message.fetchChannel();
		if (!isTextBasedChannel(channel)) return null;

		const response = await channel.send({ content, allowed_mentions: { users: [], roles: [] } });
		floatPromise(deleteMessage(response, timer));
		return response;
	}

	/**
	 * Sends the alert of a rule to the channel of a message, which is deleted a minute later.
	 *
	 * @param message - The message that infringed the rule.
	 * @param t - The translation function of the guild.
	 * @param key - The key of the alert, which takes the mention of the author as `user`.
	 */
	protected sendAlert(message: GuildMessage, t: TFunction<AnyNamespace>, key: ModerationMessageListener.AlertKey) {
		// The alerts also take the emojis every translation gets by default, which the typed options do not know about:
		const content = (t as unknown as (key: string, options: Record<string, unknown>) => string)(key, { user: message.author.toString() });
		return this.sendTemporaryMessage(message, content);
	}

	protected abstract preProcess(message: GuildMessage, rule: AutoModerationRule<Type>): Promise<T | null> | T | null;
	protected abstract onDelete(message: GuildMessage, language: TFunction<AnyNamespace>, value: T): Awaitable<unknown>;
	protected abstract onAlert(message: GuildMessage, language: TFunction<AnyNamespace>, value: T): Awaitable<unknown>;
	protected abstract onLogMessage(
		message: GuildMessage,
		language: TFunction<AnyNamespace>,
		value: T
	): Awaitable<ModerationMessageListener.LogMessage>;

	private checkRule(rule: AutoModerationRule, message: GuildMessage) {
		if (rule.ignoredChannels.includes(message.channelId)) return false;
		if (message.member === null) return false;
		if (rule.ignoredRoles.length === 0) return true;

		const { roleIds } = message.member;
		return !rule.ignoredRoles.some((id) => roleIds.includes(id));
	}

	#getReason(t: TFunction<AnyNamespace>, points: number, maximum: number) {
		return maximum === 0 ? t(this.reasonLanguageKey) : t(this.reasonLanguageKeyWithMaximum, { amount: points, maximum });
	}
}

export declare namespace ModerationMessageListener {
	/**
	 * The keys of the reasons of the cases the rules create, each has a `WithMaximum` variant for the rules that have
	 * a threshold.
	 */
	type ReasonKey =
		| `events/moderation:${'attachments' | 'capitals' | 'invites' | 'links' | 'newlines' | 'phishing' | 'stickers' | 'words' | 'zalgo'}`
		| `events/moderation:rule${NamedRuleType}`;

	/**
	 * The types of rule whose keys are named after them (`rule<Type>`, `rule<Type>Alert`, `rule<Type>Footer`), see
	 * `AutoModerationRuleListener`.
	 */
	type NamedRuleType =
		| 'Duplicates'
		| 'Characters'
		| 'Emojis'
		| 'MessageSpam'
		| 'ImageSpam'
		| 'LinksCooldown'
		| 'MassMentions'
		| 'MentionsCooldown'
		| 'Spoilers'
		| 'MaskedLinks'
		| 'StickersCooldown';

	/**
	 * The keys of the alerts the rules send to the channel when a message infringes them.
	 */
	type AlertKey =
		| `events/moderation:${'attachmentFilter' | 'capsFilter' | 'inviteFilterAlert' | 'nolink' | 'newlineFilter' | 'phishingFilter' | 'stickerFilter' | 'wordFilter' | 'zalgoFilter'}`
		| `events/moderation:rule${NamedRuleType}Alert`;

	/**
	 * What a rule logs: an embed, or a message made of components (see {@linkcode createLogMessage}).
	 */
	type LogMessage = EmbedBuilder | ReturnType<typeof createLogMessage>;

	interface Options<Type extends AutoModerationRuleType = AutoModerationRuleType> extends Listener.Options {
		/**
		 * The type of the rules the listener runs.
		 */
		type: Type;
		reasonLanguageKey: ReasonKey;
		reasonLanguageKeyWithMaximum: `${ReasonKey}WithMaximum`;
	}
	type JSON = Listener.JSON;
	type LoaderContext = Listener.LoaderContext;
}
