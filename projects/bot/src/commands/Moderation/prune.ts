import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { urlRegex } from '#utils/Links/UrlRegex';
import { days, floatPromise, seconds } from '#utils/common';
import { andMix, type BooleanFn } from '#utils/common/comparators';
import { deleteMessage, getLogger } from '#utils/functions';
import { resolveTimeSpan } from '#utils/resolvers';
import { getImageUrl } from '#utils/util';
import { Command, RegisterCommand, container, type TransformedArguments } from '@wolfstar/http-framework';
import { MessageMentions, type Message, type PermissionsString } from '@wolfstar/plugin-gateway';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits, RESTJSONErrorCodes } from 'discord-api-types/v10';
import { DiscordAPIError } from '@discordjs/rest';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * The filters of the `filter` option, they are the choices of the option.
 */
type Filter = 'attachments' | 'images' | 'author' | 'bots' | 'humans' | 'invites' | 'links' | 'you' | 'pins' | 'mentions' | 'embeds';

interface Arguments {
	amount: number;
	filter?: Filter;
	user?: TransformedArguments.User;
	before?: string;
	after?: string;
	silent?: boolean;
	age?: string;
	include?: string;
	match?: string;
	startswith?: string;
	endswith?: string;
}

/**
 * The most messages that can be pruned at once without a filter, with one the limit is {@linkcode MaximumFilteredAmount}.
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

const FilterChoices = {
	attachments: 'commands/moderation:pruneOptionsFilterChoiceAttachments',
	images: 'commands/moderation:pruneOptionsFilterChoiceImages',
	author: 'commands/moderation:pruneOptionsFilterChoiceAuthor',
	bots: 'commands/moderation:pruneOptionsFilterChoiceBots',
	humans: 'commands/moderation:pruneOptionsFilterChoiceHumans',
	invites: 'commands/moderation:pruneOptionsFilterChoiceInvites',
	links: 'commands/moderation:pruneOptionsFilterChoiceLinks',
	you: 'commands/moderation:pruneOptionsFilterChoiceYou',
	pins: 'commands/moderation:pruneOptionsFilterChoicePins',
	mentions: 'commands/moderation:pruneOptionsFilterChoiceMentions',
	embeds: 'commands/moderation:pruneOptionsFilterChoiceEmbeds'
} as const satisfies Record<Filter, `commands/moderation:${string}`>;

/**
 * Deletes the latest messages of the channel, optionally the ones that match the filters.
 *
 * @remarks
 *
 * The prefix command combined any number of flags (`--bots --links`) and subcommands (`prune bots`), that is now one
 * `filter` choice, which can be combined with the `user`, `age`, `include`, `match`, `startswith` and `endswith`
 * options. The `before` and `after` options replace the positional message argument, and default to the latest
 * messages since there is no command message to start from. Pinned messages are kept unless the `pins` filter is
 * used, which only deletes them.
 *
 * The response is temporary: it is deleted after 10 seconds, or right away with `silent`, which also keeps it private
 * while the messages are being deleted (the prefix command did not delete anything with `--silent`, that was a bug).
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/moderation:prune')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
		.addIntegerOption((option) =>
			applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsAmount').setMinValue(1).setMaxValue(MaximumAmount).setRequired(true)
		)
		.addStringOption((option) =>
			applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsFilter')
				.setChoices(...Object.entries(FilterChoices).map(([value, key]) => createLocalizedChoice(key, { value })))
				.setRequired(false)
		)
		.addUserOption((option) => applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsUser').setRequired(false))
		.addStringOption((option) =>
			applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsBefore').setMinLength(17).setMaxLength(20).setRequired(false)
		)
		.addStringOption((option) =>
			applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsAfter').setMinLength(17).setMaxLength(20).setRequired(false)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsAge').setRequired(false))
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsInclude').setRequired(false))
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsMatch').setRequired(false))
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsStartswith').setRequired(false))
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsEndswith').setRequired(false))
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/moderation:pruneOptionsSilent').setRequired(false))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, args: Arguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Moderator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

		const channelId = interaction.channelId;
		if (channelId === undefined) return fail(t('preconditions:runIn'));

		// The permissions of the bot in the channel the command was run in, which is the one that is pruned:
		const permissions = interaction.applicationPermissions ?? 0n;
		const missing = RequiredClientPermissions.filter((permission) => (permissions & PermissionFlagsBits[permission]) === 0n);
		if (missing.length > 0) return fail(t('preconditions:clientPermissions', { missing }));

		const { amount, filter } = args;
		if (filter !== undefined && amount > MaximumFilteredAmount) {
			return fail(t('arguments:integerTooLarge', { parameter: amount, maximum: MaximumFilteredAmount }));
		}

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
		const messages = await this.fetchMessages(channelId, { limit: amount, position, positionId, filter: filters });
		if (messages.length === 0) return deferred.update({ content: t('commands/moderation:pruneNoDeletes') });

		// Perform a bulk delete, ignoring the messages that were deleted in the meantime, and log the deleted messages:
		const deleted = await this.bulkDeleteMessages(interaction.guildId, channelId, messages);

		if (silent) {
			await deferred.delete();
			return null;
		}

		const content = t('commands/moderation:pruneAlert', { count: deleted, total: amount });
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
				deleted += (await manager.bulkDelete(channelId, ids.slice(i, i + 100), true)).length;
			} catch (error) {
				logger.prune.unset(channelId);
				if (!(error instanceof DiscordAPIError) || error.code !== RESTJSONErrorCodes.UnknownMessage) throw error;
			}
		}

		return deleted;
	}

	private getFilters(interaction: GuildChatInputInteraction, args: Arguments, maximumAge: number, pattern: RegExp | null): BooleanFn<[Message]> {
		const fns: BooleanFn<[Message]>[] = [];

		// The messages must be newer than the age, which is also what makes them deletable in bulk:
		const oldestMessageTimestamp = Date.now() - maximumAge;
		fns.push((message) => message.createdTimestamp > oldestMessageTimestamp);

		if (args.user) {
			const userId = args.user.id;
			fns.push((message) => message.author.id === userId);
		}

		switch (args.filter) {
			case 'attachments':
				fns.push((message) => message.attachments.size > 0);
				break;
			case 'images':
				fns.push((message) => message.attachments.some((attachment) => getImageUrl(attachment.url) !== undefined));
				break;
			case 'author': {
				const authorId = args.user?.id ?? interaction.user.id;
				fns.push((message) => message.author.id === authorId);
				break;
			}
			case 'bots':
				fns.push((message) => message.author.bot);
				break;
			case 'humans':
				fns.push((message) => !message.author.bot);
				break;
			case 'invites':
				fns.push((message) => InviteRegExp.test(message.content));
				break;
			case 'links': {
				// The regular expression is global, so it keeps the index of the last match:
				const regex = urlRegex({ requireProtocol: true, tlds: true });
				fns.push((message) => {
					regex.lastIndex = 0;
					return regex.test(message.content);
				});
				break;
			}
			case 'you': {
				const clientId = container.gatewayClient.user?.id;
				fns.push((message) => message.author.id === clientId);
				break;
			}
			case 'mentions':
				fns.push((message) => hasMentions(message.content));
				break;
			case 'embeds':
				fns.push((message) => message.embeds.length > 0);
				break;
		}

		// Pinned messages are kept, unless they are what is being deleted:
		if (args.filter === 'pins') fns.push((message) => message.pinned);
		else fns.push((message) => !message.pinned);

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
