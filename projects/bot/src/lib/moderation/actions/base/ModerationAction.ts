import { getAppealUrl, shouldLinkAppeal } from '#lib/moderation/appeals';
import type { TypeVariation } from '#utils/moderationConstants';
import { fetchGuildT, getTranslationKey } from '#lib/moderation/common';
import type { TranslationMappings } from '#lib/moderation/common/constants';
import type { ModerationManager } from '#lib/moderation/managers/ModerationManager';
import { seconds, years } from 'wolfstar-shared';
import { getCodeStyle, getLogPrefix, getModeration } from '#utils/functions';
import { TypeMetadata } from '#utils/moderationConstants';
import { getTypeColor } from '#lib/moderation/common/constants';
import { getCaseTypeEmojiKey, getModerationDirectMessageTitle, quoteLines } from '#lib/moderation/common/wording';
import { createTranslator } from '#lib/structures/commands/utils';
import { Emojis } from '#utils/emojis';
import { userMention } from '@discordjs/formatters';
import { DiscordAPIError, HTTPError } from '@discordjs/rest';
import { cutText, isNullish, isNullishOrEmpty, isNullishOrZero, type Awaitable } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { Guild, User } from '@wolfstar/plugin-gateway';
import { ComponentType, MessageFlags, RESTJSONErrorCodes, type RESTPostAPIChannelMessageJSONBody, type Snowflake } from 'discord-api-types/v10';

export abstract class ModerationAction<ContextType = never, Type extends TypeVariation = TypeVariation> {
	/**
	 * Represents the type of moderation action.
	 */
	public readonly type: Type;

	/**
	 * The minimum duration for the action.
	 */
	public readonly minimumDuration: number;

	/**
	 * The maximum duration for the action.
	 */
	public readonly maximumDuration: number;

	/**
	 * Whether or not the action allows undoing.
	 */
	public readonly isUndoActionAvailable: boolean;

	/**
	 * Whether or not the action requires a duration.
	 */
	public readonly durationRequired: boolean;

	/**
	 * Whether or not the action uses an external timer. This is true for
	 * actions that are not time-managed by the bot, such as timeouts.
	 *
	 * @remarks
	 *
	 * If this field is set to `true`, the action will need to be re-applied in
	 * order to update the duration.
	 */
	public readonly durationExternal: boolean;

	/**
	 * Whether or not the user can be told about the action with a direct message. When it is `false`, no direct message is
	 * sent whatever the settings of the guild, of the user and of the command say.
	 */
	public readonly isDirectMessageAvailable: boolean;

	/**
	 * The prefix used for logging moderation actions.
	 */
	protected readonly logPrefix: string;

	/**
	 * The key of the moderation action.
	 */
	protected readonly actionKey: (typeof TranslationMappings)[TypeVariation];

	public constructor(options: ModerationAction.ConstructorOptions<Type>) {
		this.type = options.type;
		this.actionKey = getTranslationKey(this.type);
		this.logPrefix = getLogPrefix(options.logPrefix);
		this.durationRequired = options.durationRequired ?? false;
		this.durationExternal = options.durationExternal ?? false;
		this.minimumDuration = options.minimumDuration ?? (this.durationRequired ? seconds(5) : 0);
		this.maximumDuration = options.maximumDuration ?? years(1);
		this.isUndoActionAvailable = options.isUndoActionAvailable;
		this.isDirectMessageAvailable = options.isDirectMessageAvailable ?? true;
	}

	/**
	 * Checks if this action is active for a given user in a guild.
	 *
	 * @param guild - The guild to check.
	 * @param userId - The ID of the user.
	 * @param context - The context for the action.
	 * @returns A boolean indicating whether the action is active.
	 */
	public isActive(guild: Guild, userId: Snowflake, context: ContextType): Awaitable<boolean>;
	public isActive() {
		return false;
	}

	/**
	 * Cancels the last moderation entry task from a user.
	 *
	 * @param options - The options to fetch the moderation entry.
	 * @returns The canceled moderation entry, or `null` if no entry was found.
	 */
	public async completeLastModerationEntryFromUser<SearchType extends TypeVariation = Type>(
		options: ModerationAction.ModerationEntryFetchOptions<SearchType>
	): Promise<ModerationManager.Entry<SearchType> | null> {
		const entry = await this.retrieveLastModerationEntryFromUser(options);
		if (isNullish(entry)) return null;

		if (!isNullishOrZero(entry.duration) && !entry.isCompleted()) {
			await (await getModeration(options.guild)).complete(entry);
		}
		return entry;
	}

	/**
	 * Retrieves the last moderation entry from a user based on the provided options.
	 *
	 * @param options - The options for fetching the moderation entry.
	 * @returns The last moderation entry from the user, or `null` if no entry is found.
	 */
	public async retrieveLastModerationEntryFromUser<SearchType extends TypeVariation = Type>(
		options: ModerationAction.ModerationEntryFetchOptions<SearchType>
	): Promise<ModerationManager.Entry<SearchType> | null> {
		// Retrieve all the entries
		const entries = await (await getModeration(options.guild)).fetch({ userId: options.userId });

		const type = options.type ?? this.type;
		const metadata = options.metadata ?? null;
		const extra = options.filter ?? (() => true);

		for (const entry of entries.values()) {
			// If the entry has been archived or has completed, skip it:
			if (entry.isArchived() || entry.isCompleted()) continue;
			// If the entry is not of the same type, skip it:
			if (entry.type !== type) continue;
			// If the entry is not of the same metadata, skip it:
			if (metadata !== null && entry.metadata !== metadata) continue;
			// If the extra check fails, skip it:
			if (!extra(entry as ModerationManager.Entry<SearchType>)) continue;

			return entry as ModerationManager.Entry<SearchType>;
		}

		return null;
	}

	/**
	 * Applies a moderation action to a user in the specified guild.
	 *
	 * @param guild - The guild to apply the moderation action at.
	 * @param options - The options for the moderation action.
	 * @param data - The options for sending the direct message.
	 * @returns A Promise that resolves to the created moderation entry.
	 */
	public async apply(guild: Guild, options: ModerationAction.PartialOptions<Type>, data: ModerationAction.Data<ContextType> = {}) {
		const moderation = await getModeration(guild);
		const entry = moderation.create(await this.resolveOptions(guild, options, data));
		container.logger.debug(`${this.logPrefix} Applying to ${entry.userId} in ${guild.id}, duration ${entry.duration}`);
		try {
			await this.handleApplyPreOnStart(guild, entry, data);
			await this.handleApplyPre(guild, entry, data);
		} catch (error) {
			container.logger.debug(`${this.logPrefix} Could not apply to ${entry.userId} in ${guild.id}: ${(error as Error).message}`);
			await this.handleApplyPreOnError(error as Error, guild, entry, data);
			throw error;
		}
		await this.sendDirectMessage(guild, entry, data);
		await this.handleApplyPost(guild, entry, data);

		const created = await moderation.insert(entry);
		container.logger.debug(`${this.logPrefix} Applied to ${entry.userId} in ${guild.id}: case ${created.id}`);
		return created;
	}

	/**
	 * Undoes a moderation action to a user in the specified guild.
	 *
	 * @param guild - The guild to apply the moderation action at.
	 * @param options - The options for the moderation action.
	 * @param data - The data for the action.
	 * @returns A promise that resolves to the created entry.
	 */
	public async undo(guild: Guild, options: ModerationAction.PartialOptions<Type>, data: ModerationAction.Data<ContextType> = {}) {
		const moderation = await getModeration(guild);
		const entry = moderation.create(await this.resolveAppealOptions(guild, options, data));
		container.logger.debug(`${this.logPrefix} Undoing for ${entry.userId} in ${guild.id}`);
		try {
			await this.handleUndoPreOnStart(guild, entry, data);
			await this.handleUndoPre(guild, entry, data);
		} catch (error) {
			container.logger.debug(`${this.logPrefix} Could not undo for ${entry.userId} in ${guild.id}: ${(error as Error).message}`);
			await this.handleUndoPreOnError(error as Error, guild, entry, data);
			throw error;
		}
		await this.sendDirectMessage(guild, entry, data);
		await this.handleUndoPost(guild, entry, data);

		const created = await moderation.insert(entry);
		container.logger.debug(`${this.logPrefix} Undone for ${entry.userId} in ${guild.id}: case ${created.id}`);
		return created;
	}

	/**
	 * Handles the pre-apply of the moderation action. Executed before the moderation entry is created and the user has
	 * been notified.
	 *
	 * @param guild - The guild to apply the moderation action at.
	 * @param entry - The draft moderation action.
	 * @param data - The data for the action.
	 */
	protected handleApplyPre(guild: Guild, entry: ModerationManager.Entry<Type>, data: ModerationAction.Data<ContextType>): Awaitable<unknown>;
	protected handleApplyPre() {}

	/**
	 * Handles a hook that is executed before the moderation action is applied at {@linkcode handleApplyPre}.
	 *
	 * @param guild - The guild at which the moderation action is being applied.
	 * @param entry - The draft moderation action.
	 * @param data - The data for the action.
	 */
	protected handleApplyPreOnStart(guild: Guild, entry: ModerationManager.Entry<Type>, data: ModerationAction.Data<ContextType>): unknown;
	protected handleApplyPreOnStart() {}

	/**
	 * Handles a hook that is executed when {@linkcode handleApplyPre} threw an error.
	 *
	 * @param guild - The guild at which the moderation action is being applied.
	 * @param entry - The draft moderation action.
	 * @param data - The data for the action.
	 */
	protected handleApplyPreOnError(
		error: Error,
		guild: Guild,
		entry: ModerationManager.Entry<Type>,
		data: ModerationAction.Data<ContextType>
	): unknown;

	protected handleApplyPreOnError() {}

	/**
	 * Handles the post-apply of the moderation action. Executed after the moderation entry is created and the user has
	 * been notified.
	 *
	 * @param guild - The guild to apply the moderation action at.
	 * @param entry - The draft moderation action.
	 * @param data - The data for the action.
	 */
	protected handleApplyPost(guild: Guild, entry: ModerationManager.Entry<Type>, data: ModerationAction.Data<ContextType>): Awaitable<unknown>;
	protected handleApplyPost() {}

	/**
	 * Handles the pre-undo of the moderation action. Executed before the moderation entry is created and the user has
	 * been notified.
	 *
	 * @param guild - The guild to undo a moderation action at.
	 * @param entry - The draft moderation action.
	 * @param data - The data for the action.
	 */
	protected handleUndoPre(guild: Guild, entry: ModerationManager.Entry<Type>, data: ModerationAction.Data<ContextType>): Awaitable<unknown>;
	protected handleUndoPre() {}

	/**
	 * Handles a hook that is executed before the moderation action is applied at {@linkcode handleUndoPre}.
	 *
	 * @param guild - The guild at which the moderation action is being applied.
	 * @param entry - The draft moderation action.
	 * @param data - The data for the action.
	 */
	protected handleUndoPreOnStart(guild: Guild, entry: ModerationManager.Entry<Type>, data: ModerationAction.Data<ContextType>): unknown;
	protected handleUndoPreOnStart() {}

	/**
	 * Handles a hook that is executed when {@linkcode handleUndoPre} threw an error.
	 *
	 * @param guild - The guild at which the moderation action is being applied.
	 * @param entry - The draft moderation action.
	 * @param data - The data for the action.
	 */
	protected handleUndoPreOnError(
		error: Error,
		guild: Guild,
		entry: ModerationManager.Entry<Type>,
		data: ModerationAction.Data<ContextType>
	): unknown;

	protected handleUndoPreOnError() {}

	/**
	 * Handles the post-undo of the moderation action. Executed after the moderation entry is created and the user has
	 * been notified.
	 *
	 * @param guild - The guild to undo a moderation action at.
	 * @param entry - The draft moderation action.
	 * @param data - The data for the action.
	 */
	protected handleUndoPost(guild: Guild, entry: ModerationManager.Entry<Type>, data: ModerationAction.Data<ContextType>): Awaitable<unknown>;
	protected handleUndoPost() {}

	protected async resolveOptions(
		guild: Guild,
		options: ModerationAction.PartialOptions<Type>,
		data: ModerationAction.Data<ContextType>,
		metadata: TypeMetadata = 0
	): Promise<ModerationManager.CreateData<Type>> {
		return {
			...options,
			duration: options.duration || null,
			type: this.type,
			metadata,
			extraData: options.extraData || (await this.resolveOptionsExtraData(guild, options, data))
		};
	}

	/**
	 * Resolves the extra data for the moderation action.
	 *
	 * @param guild - The guild where the moderation action occurred.
	 * @param options - The original options for the moderation action.
	 * @param data - The options for sending the direct message.
	 */
	protected resolveOptionsExtraData(
		guild: Guild,
		options: ModerationAction.PartialOptions,
		data: ModerationAction.Data<ContextType>
	): Awaitable<ModerationManager.ExtraData<Type>>;

	protected resolveOptionsExtraData() {
		return null as ModerationManager.ExtraData<Type>;
	}

	/**
	 * Resolves the options for an appeal.
	 *
	 * @param guild - The guild where the moderation action occurred.
	 * @param options - The original options for the moderation action.
	 * @param data - The data for the action.
	 */
	protected async resolveAppealOptions(guild: Guild, options: ModerationAction.PartialOptions<Type>, data: ModerationAction.Data<ContextType>) {
		return this.resolveOptions(guild, options, data, TypeMetadata.Undo);
	}

	/**
	 * Sends a direct message to the user associated with the moderation entry.
	 *
	 * @param guild - The guild where the moderation action occurred.
	 * @param entry - The moderation entry.
	 * @param data - The data for the action.
	 */
	protected async sendDirectMessage(guild: Guild, entry: ModerationManager.Entry, data: ModerationAction.Data<ContextType>) {
		if (!this.isDirectMessageAvailable || !data.sendDirectMessage) return;

		try {
			const target = await entry.fetchUser();
			await target.send(await this.#buildDirectMessage(guild, entry, data));
			container.logger.debug(`${this.logPrefix} Direct message sent to ${entry.userId}`);
		} catch (error) {
			container.logger.debug(`${this.logPrefix} Direct message to ${entry.userId} not delivered: ${(error as Error).message}`);
			// It throws what is not the user having closed their direct messages, which is not a failure of the case:
			this.#handleDirectMessageError(error as Error);
			data.directMessageUndelivered = true;
		}
	}

	/**
	 * Retrieves the reason for a moderation action.
	 *
	 * @param guild - The guild where the moderation action occurred.
	 * @param reason - The reason for the moderation action.
	 * @param undo - Whether the action is an undo action.
	 * @returns The reason for the moderation action.
	 */
	protected async getReason(guild: Guild, reason: string | null | undefined, undo = false) {
		const t = await fetchGuildT(guild);
		const action = t(this.actionKey);
		return isNullishOrEmpty(reason)
			? t(undo ? 'moderationActions:revokeNoReason' : 'moderationActions:applyNoReason', { action })
			: t(undo ? 'moderationActions:revokeReason' : 'moderationActions:applyReason', { action, reason });
	}

	/**
	 * The direct message the user of a case gets, as Flamey sends it: a container with the colour of the type, what was
	 * done to them and where, who did it when the server shows it, the duration, the reason, and how to appeal.
	 *
	 * @remarks The case has no number yet: the message is sent before the case is written, since a ban or a kick leaves
	 * the user with no server in common with the bot, which then cannot write to them.
	 */
	async #buildDirectMessage(guild: Guild, entry: ModerationManager.Entry, data: ModerationAction.Data<ContextType>) {
		const guildT = await fetchGuildT(guild);
		const t = createTranslator(guildT as unknown as Parameters<typeof createTranslator>[0]);
		const undo = entry.isUndo();
		const lines = [`## ${Emojis[getCaseTypeEmojiKey(entry.type)]} ${getModerationDirectMessageTitle(t, entry.type, undo, guild.name)}`];
		if (data.moderator) lines.push(t('commands/moderation:moderationDmBy', { moderator: userMention(data.moderator.id) }));

		// Only an action that can be temporary reads as permanent without a duration, the others have none:
		if (!isNullishOrZero(entry.duration)) {
			lines.push(t('commands/moderation:moderationDmDuration', { duration: t('globals:durationValue', { value: entry.duration }) }));
		} else if (this.isUndoActionAvailable && !undo) {
			lines.push(t('commands/moderation:moderationDmDuration', { duration: t('commands/moderation:moderationDmPermanent') }));
		}

		lines.push(
			t('commands/moderation:moderationDmReason'),
			quoteLines(isNullishOrEmpty(entry.reason) ? t('commands/moderation:moderationDmNoReason') : cutText(entry.reason, 1500))
		);

		if (data.reinviteUrl) lines.push(t('commands/honeypot:reinviteMessage', { url: data.reinviteUrl }));
		// The case can be appealed on the website, when the guild takes appeals for its type:
		if (await shouldLinkAppeal(guild.id, entry.type, undo)) {
			lines.push(t('commands/moderation:moderationDmAppeal', { url: getAppealUrl(guild.id) }));
		}

		lines.push(`-# ${t('commands/moderation:moderationDmFooter')}`);
		return {
			components: [
				{
					type: ComponentType.Container,
					accent_color: getTypeColor(entry),
					components: [{ type: ComponentType.TextDisplay, content: lines.join('\n') }]
				}
			],
			flags: MessageFlags.IsComponentsV2,
			allowed_mentions: { parse: [] }
		} satisfies RESTPostAPIChannelMessageJSONBody;
	}

	#handleDirectMessageError(error: Error) {
		if (error instanceof DiscordAPIError) return this.#handleDirectMessageDiscordError(error);
		if (error instanceof HTTPError) return this.#handleDirectMessageHTTPError(error);
		throw error;
	}

	#handleDirectMessageDiscordError(error: DiscordAPIError) {
		if (error.code === RESTJSONErrorCodes.CannotSendMessagesToThisUser) return;

		container.logger.error(this.logPrefix, getCodeStyle(error.code), error.url);
		throw error;
	}

	#handleDirectMessageHTTPError(error: HTTPError) {
		container.logger.error(this.logPrefix, getCodeStyle(error.status), error.url);
		throw error;
	}
}

export declare namespace ModerationAction {
	interface ConstructorOptions<Type extends TypeVariation = TypeVariation> {
		type: Type;
		logPrefix: string;
		isUndoActionAvailable: boolean;
		isDirectMessageAvailable?: boolean;
		minimumDuration?: number;
		maximumDuration?: number;
		durationRequired?: boolean;
		durationExternal?: boolean;
	}

	type Options<Type extends TypeVariation = TypeVariation> = ModerationManager.CreateData<Type>;
	type PartialOptions<Type extends TypeVariation = TypeVariation> = Omit<Options<Type>, 'type' | 'metadata'>;

	type Entry<Type extends TypeVariation = TypeVariation> = ModerationManager.Entry<Type>;

	interface Data<ContextType = never> {
		context?: ContextType;
		sendDirectMessage?: boolean;
		reinviteUrl?: string;
		moderator?: User | null;

		/**
		 * Whether an undo takes a target that is no longer under the action as done, and finishes the case: an appeal that
		 * is approved after the ban was lifted by hand. Without it Discord's refusal stops the undo, as `/ban remove` wants.
		 */
		ignoreMissing?: boolean;

		/**
		 * Set by the action when the user could not be sent the direct message, which the case is made without.
		 */
		directMessageUndelivered?: boolean;
	}

	interface ModerationEntryFetchOptions<Type extends TypeVariation = TypeVariation> {
		guild: Guild;
		userId: Snowflake;
		type?: Type;
		metadata?: TypeMetadata | null;
		filter?: (entry: ModerationManager.Entry<Type>) => boolean;
	}
}
