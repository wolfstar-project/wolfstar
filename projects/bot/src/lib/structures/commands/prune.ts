import { andMix, days, floatPromise, seconds, type BooleanFn } from '#common';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { urlRegex } from '#utils/Links/UrlRegex';
import { deleteMessage, getLogger } from '#utils/functions';
import { resolveTimeSpan } from '#utils/resolvers';
import { getImageUrl } from '#utils/util';
import { DiscordAPIError } from '@discordjs/rest';
import type { SlashCommandSubcommandBuilder } from '@discordjs/builders';
import { container, type TransformedArguments } from '@wolfstar/http-framework';
import { MessageMentions, type Message, type PermissionsString } from '@wolfstar/plugin-gateway';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags, PermissionFlagsBits, RESTJSONErrorCodes } from 'discord-api-types/v10';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * The subcommands of `/prune`, which tell what kind of message is deleted:
 *
 * - `any`: every message, the only one that can delete up to 1000 at once.
 * - `attachments`, `images`, `bots`, `humans`, `invites`, `links`, `you`, `mentions` and `embeds`: the messages that match.
 * - `author`: the messages of the `user` option, or of the author of the command when there is none.
 * - `pins`: the pinned messages, which every other subcommand keeps.
 * - `age`, `includes`, `match`, `startswith` and `endswith`: the messages that match their (required) option.
 */
export type PruneSubcommand =
	| 'any'
	| 'attachments'
	| 'images'
	| 'author'
	| 'bots'
	| 'humans'
	| 'invites'
	| 'links'
	| 'you'
	| 'pins'
	| 'age'
	| 'includes'
	| 'match'
	| 'startswith'
	| 'endswith'
	| 'mentions'
	| 'embeds';

/**
 * The toggles that every subcommand but the one of the same name accepts, to combine filters.
 */
type PruneToggle = 'attachments' | 'images' | 'bots' | 'humans' | 'invites' | 'links' | 'you' | 'pins' | 'mentions' | 'embeds';

const PruneToggles = [
	'attachments',
	'images',
	'bots',
	'humans',
	'invites',
	'links',
	'you',
	'pins',
	'mentions',
	'embeds'
] as const satisfies readonly PruneToggle[];

/**
 * The options that hold text, the subcommand of the same name requires its own.
 */
type PruneText = 'age' | 'include' | 'match' | 'startswith' | 'endswith';

const PruneTexts = ['age', 'include', 'match', 'startswith', 'endswith'] as const satisfies readonly PruneText[];

/**
 * The text option each subcommand requires, the other ones leave it optional.
 */
const PruneRequiredText: Partial<Record<PruneSubcommand, PruneText>> = {
	age: 'age',
	includes: 'include',
	match: 'match',
	startswith: 'startswith',
	endswith: 'endswith'
};

export interface PruneArguments extends Partial<Record<PruneToggle, boolean>>, Partial<Record<PruneText, string>> {
	amount: number;
	before?: string;
	after?: string;
	user?: TransformedArguments.User;
	silent?: boolean;
}

/**
 * The most messages that can be pruned at once with `any`, the other subcommands go up to {@linkcode MaximumFilteredAmount}.
 */
const MaximumAmount = 1000;
const MaximumFilteredAmount = 100;

/**
 * Discord only bulk deletes the messages that are newer than 14 days.
 */
const MaximumAge = days(14);

const RequiredClientPermissions = ['ManageMessages', 'ReadMessageHistory', 'EmbedLinks'] as const satisfies readonly PermissionsString[];

const MessageIdPattern = /^\d{17,20}$/;
const InviteRegExp = /(?:discord\.(?:gg|io|me|plus|link)|invite\.(?:gg|ink)|discord(?:app)?\.com\/invite)\/(?:[\w-]{2,})/i;

/**
 * The translation keys of the subcommands, which hold their name and description.
 */
const SubcommandKeys = {
	any: 'commands/moderation:pruneAny',
	attachments: 'commands/moderation:pruneAttachments',
	images: 'commands/moderation:pruneImages',
	author: 'commands/moderation:pruneAuthor',
	bots: 'commands/moderation:pruneBots',
	humans: 'commands/moderation:pruneHumans',
	invites: 'commands/moderation:pruneInvites',
	links: 'commands/moderation:pruneLinks',
	you: 'commands/moderation:pruneYou',
	pins: 'commands/moderation:prunePins',
	age: 'commands/moderation:pruneAge',
	includes: 'commands/moderation:pruneIncludes',
	match: 'commands/moderation:pruneMatch',
	startswith: 'commands/moderation:pruneStartswith',
	endswith: 'commands/moderation:pruneEndswith',
	mentions: 'commands/moderation:pruneMentions',
	embeds: 'commands/moderation:pruneEmbeds'
} as const satisfies Record<PruneSubcommand, `commands/moderation:${string}`>;

const ToggleKeys = {
	attachments: 'commands/moderation:pruneOptionsAttachments',
	images: 'commands/moderation:pruneOptionsImages',
	bots: 'commands/moderation:pruneOptionsBots',
	humans: 'commands/moderation:pruneOptionsHumans',
	invites: 'commands/moderation:pruneOptionsInvites',
	links: 'commands/moderation:pruneOptionsLinks',
	you: 'commands/moderation:pruneOptionsYou',
	pins: 'commands/moderation:pruneOptionsPins',
	mentions: 'commands/moderation:pruneOptionsMentions',
	embeds: 'commands/moderation:pruneOptionsEmbeds'
} as const satisfies Record<PruneToggle, `commands/moderation:${string}`>;

const TextKeys = {
	age: 'commands/moderation:pruneOptionsAge',
	include: 'commands/moderation:pruneOptionsInclude',
	match: 'commands/moderation:pruneOptionsMatch',
	startswith: 'commands/moderation:pruneOptionsStartswith',
	endswith: 'commands/moderation:pruneOptionsEndswith'
} as const satisfies Record<PruneText, `commands/moderation:${string}`>;

/**
 * Applies the name, the description and the options of a `/prune` subcommand to its builder, to be used in
 * `RegisterAsSubcommand`.
 *
 * @remarks
 *
 * Every subcommand has the same options so that the filters can be combined, but the one it is named after: the toggle of
 * the same name is left out, and the text option of the same name is required instead of optional. Discord requires the
 * required options to come first, hence the order.
 *
 * @param builder - The builder to apply the data to.
 * @param subcommand - The subcommand the builder is of.
 */
export function applyPruneSubcommandBuilder(builder: SlashCommandSubcommandBuilder, subcommand: PruneSubcommand): SlashCommandSubcommandBuilder {
	const maximum = subcommand === 'any' ? MaximumAmount : MaximumFilteredAmount;
	const requiredText = PruneRequiredText[subcommand];

	let result = applyLocalizedBuilder(builder, SubcommandKeys[subcommand]).addIntegerOption((option) =>
		applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsAmount').setMinValue(1).setMaxValue(maximum).setRequired(true)
	);

	if (requiredText !== undefined) {
		result = result.addStringOption((option) => applyLocalizedBuilder(option, TextKeys[requiredText]).setRequired(true));
	}

	result = result
		.addStringOption((option) =>
			applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsBefore').setMinLength(17).setMaxLength(20).setRequired(false)
		)
		.addStringOption((option) =>
			applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsAfter').setMinLength(17).setMaxLength(20).setRequired(false)
		)
		.addUserOption((option) => applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsUser').setRequired(false));

	for (const text of PruneTexts) {
		if (text === requiredText) continue;
		result = result.addStringOption((option) => applyLocalizedBuilder(option, TextKeys[text]).setRequired(false));
	}

	for (const toggle of PruneToggles) {
		if (toggle === subcommand) continue;
		result = result.addBooleanOption((option) => applyLocalizedBuilder(option, ToggleKeys[toggle]).setRequired(false));
	}

	return result.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsSilent').setRequired(false));
}

/**
 * The base of the `/prune` subcommands: deletes the latest messages of the channel that match the filters of its
 * {@linkcode PruneCommand.subcommand} and of the options.
 *
 * @remarks
 *
 * The `before` and `after` options default to the latest messages, since there is no command message to start from.
 * Pinned messages are kept unless the `pins` toggle is used, or the subcommand is `pins`, which only deletes them.
 *
 * The response is temporary: it is deleted after 10 seconds, or right away with `silent`, which also keeps it private
 * while the messages are being deleted.
 */
export abstract class PruneCommand extends Command {
	/**
	 * The subcommand this command is.
	 */
	protected abstract readonly subcommand: PruneSubcommand;

	public override async chatInputRun(interaction: GuildChatInputInteraction, args: PruneArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Moderator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

		const channelId = interaction.channel.id;

		// The permissions of the bot in the channel the command was run in, which is the one that is pruned:
		const permissions = interaction.applicationPermissions ?? 0n;
		const missing = RequiredClientPermissions.filter((permission) => (permissions & PermissionFlagsBits[permission]) === 0n);
		if (missing.length > 0) return fail(t('preconditions:clientPermissions', { missing }));

		if (args.before !== undefined && args.after !== undefined) return fail(t('commands/moderation:pruneBothPositions'));
		const position = args.after === undefined ? 'before' : 'after';
		const positionId = args.before ?? args.after;
		if (positionId !== undefined && !MessageIdPattern.test(positionId)) {
			return fail(t('commands/moderation:pruneInvalidMessage', { parameter: positionId }));
		}

		let maximumAge = MaximumAge;
		if (args.age !== undefined) {
			const result = resolveTimeSpan(args.age, { minimum: 0, maximum: MaximumAge });
			if (result.isErr()) return fail(t(result.unwrapErr(), { parameter: args.age, minimum: 0, maximum: MaximumAge }));
			maximumAge = result.unwrap();
		}

		let pattern: RegExp | null = null;
		if (args.match) {
			try {
				pattern = new RegExp(args.match, 'i');
			} catch {
				return fail(t('commands/moderation:pruneInvalidPattern', { pattern: args.match }));
			}
		}

		const silent = args.silent === true;
		const deferred = await interaction.defer(silent ? { flags: MessageFlags.Ephemeral } : undefined);

		const filters = this.getFilters(interaction, args, maximumAge, pattern);
		const messages = await this.fetchMessages(channelId, { limit: args.amount, position, positionId, filter: filters });
		if (messages.length === 0) return deferred.update({ content: t('commands/moderation:pruneNoDeletes') });

		// Perform a bulk delete, ignoring the messages that were deleted in the meantime, and log the deleted messages:
		const deleted = await this.bulkDeleteMessages(interaction.guildId, channelId, messages);

		if (silent) {
			await deferred.delete();
			return null;
		}

		const content = t('commands/moderation:pruneAlert', { count: deleted, total: args.amount });
		await deferred.update({ content });
		floatPromise(deleteMessage(deferred, seconds(10)));
		return null;
	}

	private async fetchMessages(
		channelId: string,
		options: { limit: number; position: 'before' | 'after'; positionId: string | undefined; filter: BooleanFn<[Message]> }
	) {
		const { limit, position, filter } = options;
		const { messages: manager } = container.gatewayClient;

		const collected = new Map<string, Message>();
		let cursor = options.positionId;
		let remaining = limit;

		while (remaining > 0) {
			const page = await manager.list(channelId, { limit: 100, [position]: cursor });
			const filtered = page.filter((message) => filter(message)).sort((a, b) => b.createdTimestamp - a.createdTimestamp);

			for (const message of filtered) {
				if (remaining <= 0) break;
				collected.set(message.id, message);
				remaining--;
			}

			// Keep paging while the page had something to delete, Discord rate limits the history requests:
			if (remaining <= 0 || filtered.length === 0) break;
			cursor = position === 'before' ? filtered.at(-1)!.id : filtered[0].id;
			await sleep(2000);
		}

		return [...collected.values()];
	}

	private async bulkDeleteMessages(guildId: string, channelId: string, messages: readonly Message[]) {
		const logger = await getLogger(guildId);
		logger.prune.set(channelId, { userId: container.gatewayClient.user!.id });

		const { messages: manager } = container.gatewayClient;
		const ids = messages.map((message) => message.id);
		let deleted = 0;

		for (let i = 0; i < ids.length; i += 100) {
			try {
				deleted += (await manager.bulkDelete(channelId, ids.slice(i, i + 100), true)).size;
			} catch (error) {
				logger.prune.unset(channelId);
				if (!(error instanceof DiscordAPIError) || error.code !== RESTJSONErrorCodes.UnknownMessage) throw error;
			}
		}

		return deleted;
	}

	private getFilters(
		interaction: GuildChatInputInteraction,
		args: PruneArguments,
		maximumAge: number,
		pattern: RegExp | null
	): BooleanFn<[Message]> {
		const fns: BooleanFn<[Message]>[] = [];

		// The messages must be newer than the age, which is also what makes them deletable in bulk:
		const oldestMessageTimestamp = Date.now() - maximumAge;
		fns.push((message) => message.createdTimestamp > oldestMessageTimestamp);

		// The subcommand a toggle is named after turns it on:
		const toggles: Partial<Record<PruneToggle, boolean>> = { ...args, [this.subcommand]: true };

		const userId = args.user?.id ?? (this.subcommand === 'author' ? interaction.user.id : undefined);
		if (userId !== undefined) fns.push((message) => message.author.id === userId);

		if (toggles.attachments) fns.push((message) => message.attachments.size > 0);
		if (toggles.images) fns.push((message) => message.attachments.some((attachment) => getImageUrl(attachment.url) !== undefined));
		if (toggles.bots) fns.push((message) => message.author.bot);
		if (toggles.humans) fns.push((message) => !message.author.bot);
		if (toggles.invites) fns.push((message) => InviteRegExp.test(message.content));
		if (toggles.links) {
			// The regular expression is global, so it keeps the index of the last match:
			const regex = urlRegex({ requireProtocol: true, tlds: true });
			fns.push((message) => {
				regex.lastIndex = 0;
				return regex.test(message.content);
			});
		}
		if (toggles.you) {
			const clientId = container.gatewayClient.user?.id;
			fns.push((message) => message.author.id === clientId);
		}
		if (toggles.mentions) fns.push((message) => hasMentions(message.content));
		if (toggles.embeds) fns.push((message) => message.embeds.length > 0);

		// Pinned messages are kept, unless they are what is being deleted or the toggle asks for them too:
		if (this.subcommand === 'pins') fns.push((message) => message.pinned);
		else if (args.pins !== true) fns.push((message) => !message.pinned);

		const include = args.include?.toLowerCase();
		if (include) fns.push((message) => message.content.toLowerCase().includes(include));
		if (pattern) fns.push((message) => pattern.test(message.content));
		const startswith = args.startswith?.toLowerCase();
		if (startswith) fns.push((message) => message.content.toLowerCase().startsWith(startswith));
		const endswith = args.endswith?.toLowerCase();
		if (endswith) fns.push((message) => message.content.toLowerCase().endsWith(endswith));

		return andMix(...fns);
	}
}

/**
 * Whether the content mentions a user, a role or a channel, the gateway message only resolves the mentions it has in
 * the cache, so the content is read instead.
 */
function hasMentions(content: string) {
	return [MessageMentions.UsersPattern, MessageMentions.RolesPattern, MessageMentions.ChannelsPattern].some((pattern) =>
		new RegExp(pattern.source).test(content)
	);
}
