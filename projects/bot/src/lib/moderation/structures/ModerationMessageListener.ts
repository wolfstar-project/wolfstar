import { readSettings, readSettingsAdder, type AdderKey } from '#lib/database';
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
import type { GuildMember, Message } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { AutoModerationHardAction, GuildSettingsOfType, ReadonlyGuildData } from 'wolfstar-database';

/**
 * The base of the listeners that run an auto-moderation rule on the messages the members send
 * (`src/listeners/moderation/messages`), which all listen to {@linkcode Events.GuildUserMessage}.
 *
 * @remarks
 *
 * A message that infringes the rule ({@linkcode ModerationMessageListener.preProcess} returns a value) gets the soft
 * actions of the rule (delete, alert, log), then the infraction is added to the threshold of the rule, and the hard
 * action is taken once the threshold is reached, or right away when the rule has no threshold.
 */
export abstract class ModerationMessageListener<T = unknown> extends Listener {
	private readonly keyEnabled: GuildSettingsOfType<boolean>;
	private readonly ignoredRolesPath: GuildSettingsOfType<readonly string[]>;
	private readonly ignoredChannelsPath: GuildSettingsOfType<readonly string[]>;
	private readonly softPunishmentPath: GuildSettingsOfType<number>;
	private readonly hardPunishmentPath: HardPunishment;
	private readonly reasonLanguageKey: ModerationMessageListener.ReasonKey;
	private readonly reasonLanguageKeyWithMaximum: `${ModerationMessageListener.ReasonKey}WithMaximum`;

	public constructor(context: ModerationMessageListener.LoaderContext, options: ModerationMessageListener.Options) {
		super(context, { ...options, event: Events.GuildUserMessage });

		this.keyEnabled = options.keyEnabled;
		this.ignoredRolesPath = options.ignoredRolesPath;
		this.ignoredChannelsPath = options.ignoredChannelsPath;
		this.softPunishmentPath = options.softPunishmentPath;
		this.hardPunishmentPath = options.hardPunishmentPath;
		this.reasonLanguageKey = options.reasonLanguageKey;
		this.reasonLanguageKeyWithMaximum = options.reasonLanguageKeyWithMaximum;
	}

	public async run(message: GuildMessage) {
		const shouldRun = await this.checkPreRun(message);
		if (!shouldRun) return;

		if (await isModerator(message.member)) return;

		const preProcessed = await this.preProcess(message);
		if (preProcessed === null) return;

		const settings = await readSettings(message.guildId);

		const logChannelId = settings.moderationChannel;
		const filter = settings[this.softPunishmentPath];
		const t = await fetchGuildT({ id: message.guildId });
		await this.processSoftPunishment(message, logChannelId, t, filter, preProcessed);

		if (this.hardPunishmentPath === null) return;

		const adder = readSettingsAdder(settings, this.hardPunishmentPath.adder);
		if (!adder) return this.processHardPunishment(message, t, 0, 0);

		const points = typeof preProcessed === 'number' ? preProcessed : 1;
		try {
			adder.add(message.author.id, points);
		} catch (error) {
			await this.processHardPunishment(message, t, (error as AdderError).amount, adder.maximum);
		}
	}

	protected async processSoftPunishment(
		message: GuildMessage,
		logChannelId: string | Nullish,
		language: TFunction<AnyNamespace>,
		bitfield: number,
		preProcessed: T
	) {
		if (AutoModerationOnInfraction.has(bitfield, AutoModerationOnInfraction.flags.Delete) && (await message.fetchDeletable())) {
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

	protected async processHardPunishment(message: GuildMessage, language: TFunction<AnyNamespace>, points: number, maximum: number) {
		const settings = await readSettings(message.guildId);
		const action = settings[this.hardPunishmentPath.action];
		const duration = settings[this.hardPunishmentPath.actionDuration];
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

	protected abstract preProcess(message: GuildMessage): Promise<T | null> | T | null;
	protected abstract onDelete(message: GuildMessage, language: TFunction<AnyNamespace>, value: T): Awaitable<unknown>;
	protected abstract onAlert(message: GuildMessage, language: TFunction<AnyNamespace>, value: T): Awaitable<unknown>;
	protected abstract onLogMessage(
		message: GuildMessage,
		language: TFunction<AnyNamespace>,
		value: T
	): Awaitable<ModerationMessageListener.LogMessage>;

	private async checkPreRun(message: GuildMessage) {
		const settings = await readSettings(message.guildId);
		return settings[this.keyEnabled] && this.checkMessageChannel(settings, message.channelId) && this.checkMemberRoles(settings, message.member);
	}

	private checkMessageChannel(settings: ReadonlyGuildData, channelId: string) {
		const localIgnore = settings[this.ignoredChannelsPath] as readonly string[];
		if (localIgnore.includes(channelId)) return false;

		return true;
	}

	private checkMemberRoles(settings: ReadonlyGuildData, member: GuildMember | null) {
		if (member === null) return false;

		const ignoredRoles = settings[this.ignoredRolesPath];
		if (ignoredRoles.length === 0) return true;

		const { roleIds } = member;
		return !ignoredRoles.some((id) => roleIds.includes(id));
	}

	#getReason(t: TFunction<AnyNamespace>, points: number, maximum: number) {
		return maximum === 0 ? t(this.reasonLanguageKey) : t(this.reasonLanguageKeyWithMaximum, { amount: points, maximum });
	}
}

export interface HardPunishment {
	action: GuildSettingsOfType<AutoModerationHardAction>;
	actionDuration: GuildSettingsOfType<number | null>;
	adder: AdderKey;
}

export namespace ModerationMessageListener {
	/**
	 * The keys of the reasons of the cases the rules create, each has a `WithMaximum` variant for the rules that have
	 * a threshold.
	 */
	export type ReasonKey = `events/moderation:${'attachments' | 'capitals' | 'invites' | 'links' | 'newlines' | 'words'}`;

	/**
	 * The keys of the alerts the rules send to the channel when a message infringes them.
	 */
	export type AlertKey = `events/moderation:${'attachmentFilter' | 'capsFilter' | 'inviteFilterAlert' | 'nolink' | 'newlineFilter' | 'wordFilter'}`;

	/**
	 * What a rule logs: an embed, or a message made of components (see {@linkcode createLogMessage}).
	 */
	export type LogMessage = EmbedBuilder | ReturnType<typeof createLogMessage>;

	export interface Options extends Listener.Options {
		keyEnabled: GuildSettingsOfType<boolean>;
		ignoredRolesPath: GuildSettingsOfType<readonly string[]>;
		ignoredChannelsPath: GuildSettingsOfType<readonly string[]>;
		softPunishmentPath: GuildSettingsOfType<number>;
		hardPunishmentPath: HardPunishment;
		reasonLanguageKey: ReasonKey;
		reasonLanguageKeyWithMaximum: `${ReasonKey}WithMaximum`;
	}
	export type JSON = Listener.JSON;
	export type LoaderContext = Listener.LoaderContext;
}
