import { LanguageKeys } from '#lib/i18n/languageKeys';
import { WolfSubcommand } from '#lib/structures';
import { PermissionLevels, type GuildMessage } from '#lib/types';
import { urlRegex } from '#utils/Links/UrlRegex';
import { days, isGuildMessage, seconds } from '#utils/common';
import { andMix, type BooleanFn } from '#utils/common/comparators';
import { getLogger, sendTemporaryMessage } from '#utils/functions';
import { getImageUrl } from '#utils/util';
import { ApplyOptions } from '@sapphire/decorators';
import { Args, Argument, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { filterNullAndUndefined, isNullish, isNullishOrEmpty } from '@sapphire/utilities';
import { Collection, PermissionFlagsBits, RESTJSONErrorCodes, Message, type PartialMessage, TextChannel, DiscordAPIError } from 'discord.js';
import { chunk } from '@sapphire/iterator-utilities';
import { setTimeout } from 'node:timers/promises';

const enum Position {
	Before,
	After
}

const attachmentsFlags = ['f', 'file', 'files', 'upload', 'uploads'] as const;
const imageFlags = ['img', 'image', 'images'] as const;
const authorFlags = ['a', 'author', 'me'] as const;
const botsFlags = ['b', 'bot', 'bots'] as const;
const humansFlags = ['h', 'human', 'humans'] as const;
const invitesFlags = ['i', 'inv', 'invite', 'invites'] as const;
const linksFlags = ['l', 'link', 'links'] as const;
const youFlags = ['y', 'you', 'wolfstar'] as const;
const pinsFlags = ['p', 'pin', 'pins'] as const;
const silentFlags = ['s', 'silent'] as const;
const mentionsFlags = ['men', 'mentions'] as const;
const embedsFlags = ['e', 'embeds'] as const;
const ageOptions = ['age'] as const;
const includesOptions = ['include', 'includes', 'contain', 'contains'] as const;
const matchOptions = ['m', 'match'] as const;
const startswithOptions = ['sw', 'startswith'] as const;
const endswithOptions = ['ew', 'endswith'] as const;

@ApplyOptions<WolfSubcommand.Options>({
	aliases: ['purge', 'nuke', 'sweep'],
	description: LanguageKeys.Commands.Moderation.PruneDescription,
	detailedDescription: LanguageKeys.Commands.Moderation.PruneExtended,
	subcommands: [
		{ name: 'attachments', messageRun: 'attachments' },
		{ name: 'images', messageRun: 'images' },
		{ name: 'author', messageRun: 'author' },
		{ name: 'bots', messageRun: 'bots' },
		{ name: 'humans', messageRun: 'humans' },
		{ name: 'invites', messageRun: 'invites' },
		{ name: 'links', messageRun: 'links' },
		{ name: 'you', messageRun: 'you' },
		{ name: 'pins', messageRun: 'pins' },
		{ name: 'silent', messageRun: 'silent' },
		{ name: 'age', messageRun: 'age' },
		{ name: 'includes', messageRun: 'includes' },
		{ name: 'match', messageRun: 'match' },
		{ name: 'startswith', messageRun: 'startswith' },
		{ name: 'endswith', messageRun: 'endswith' },
		{ name: 'mentions', messageRun: 'mentions' },
		{ name: 'embeds', messageRun: 'embeds' },
		{ name: 'any', messageRun: 'any', default: true }
	],
	flags: [
		...attachmentsFlags,
		...imageFlags,
		...authorFlags,
		...botsFlags,
		...humansFlags,
		...invitesFlags,
		...linksFlags,
		...youFlags,
		...pinsFlags,
		...silentFlags
	],
	options: [...ageOptions, ...matchOptions, ...startswithOptions, ...endswithOptions, ...includesOptions],
	permissionLevel: PermissionLevels.Moderator,
	requiredClientPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks],
	runIn: [CommandOptionsRunTypeEnum.GuildAny]
})
export class UserCommand extends WolfSubcommand {
	private get timespan(): Argument<number> {
		return this.container.stores.get('arguments').get('timespan') as Argument<number>;
	}

	public async any(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, () => true, 'any');
	}

	public async attachments(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.attachments.size > 0, 'attachments');
	}

	public async images(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.attachments.some((at) => !isNullish(getImageUrl(at.url))), 'images');
	}

	public async author(message: GuildMessage, args: WolfSubcommand.Args) {
		const author = args.finished ? message.author : await args.pick('user');
		return this.handlePurge(message, args, (msg) => msg.author.id === author.id, 'author');
	}

	public async bots(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.author.bot, 'bots');
	}

	public async humans(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => !msg.author.bot, 'humans');
	}

	public async invites(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => UserCommand.kInviteRegExp.test(msg.content), 'invites');
	}

	public async links(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => UserCommand.kLinkRegExp.test(msg.content), 'links');
	}

	public async you(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.author.id === process.env.CLIENT_ID, 'you');
	}

	public async pins(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.pinned, 'pins');
	}

	public async silent(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, () => true, 'silent', true);
	}

	public async age(message: GuildMessage, args: WolfSubcommand.Args) {
		const maximumAge = await this.getAge(args);
		const oldestMessageTimestamp = Date.now() - maximumAge;
		return this.handlePurge(message, args, (msg) => msg.createdTimestamp > oldestMessageTimestamp, 'age');
	}

	public async includes(message: GuildMessage, args: WolfSubcommand.Args) {
		const includes = (await args.rest('string')).toLowerCase();
		return this.handlePurge(message, args, (msg) => msg.content.toLowerCase().includes(includes), 'includes');
	}

	public async match(message: GuildMessage, args: WolfSubcommand.Args) {
		const pattern = new RegExp(await args.rest('string'), 'i');
		return this.handlePurge(message, args, (msg) => pattern.test(msg.content), 'match');
	}

	public async startswith(message: GuildMessage, args: WolfSubcommand.Args) {
		const startswith = (await args.rest('string')).toLowerCase();
		return this.handlePurge(message, args, (msg) => msg.content.toLowerCase().startsWith(startswith), 'startswith');
	}

	public async endswith(message: GuildMessage, args: WolfSubcommand.Args) {
		const endswith = (await args.rest('string')).toLowerCase();
		return this.handlePurge(message, args, (msg) => msg.content.toLowerCase().endsWith(endswith), 'endswith');
	}

	public async mentions(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(
			message,
			args,
			(msg) => msg.mentions.users.size > 0 || msg.mentions.roles.size > 0 || msg.mentions.channels.size > 0,
			'mentions'
		);
	}

	public async embeds(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.embeds.length > 0, 'embeds');
	}

	private async handlePurge(
		message: GuildMessage,
		args: WolfSubcommand.Args,
		filter: BooleanFn<[GuildMessage]>,
		subcommand: string,
		silent = false
	) {
		const limit = await args.pick('integer', { minimum: 1, maximum: subcommand === 'any' ? 1000 : 100 });
		const rawPosition = args.finished ? null : await args.pick(UserCommand.position);
		const targetMessage = args.finished && rawPosition === null ? message : await args.pick('message');
		const combinedFilter = await this.getFilters(args);

		// Combine the filter with the additional filter provided by the subcommand
		const finalFilter = (msg: GuildMessage) => {
			switch (subcommand) {
				case 'bots':
					if (args.getFlags(...botsFlags)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'humans':
					if (args.getFlags(...humansFlags)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'attachments':
					if (args.getFlags(...attachmentsFlags)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'images':
					if (args.getFlags(...imageFlags)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'author':
					if (args.getFlags(...authorFlags)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'invites':
					if (args.getFlags(...invitesFlags)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'links':
					if (args.getFlags(...linksFlags)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'you':
					if (args.getFlags(...youFlags)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'pins':
					if (args.getFlags(...pinsFlags)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'silent':
					if (args.getFlags(...silentFlags)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'mentions':
					if (args.getFlags(...mentionsFlags)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'embeds':
					if (args.getFlags(...embedsFlags)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'age':
					if (args.getOption(...ageOptions)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'includes':
					if (args.getOption(...includesOptions)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'match':
					if (args.getOption(...matchOptions)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'startswith':
					if (args.getOption(...startswithOptions)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
				case 'endswith':
					if (args.getOption(...endswithOptions)) {
						this.error(LanguageKeys.Commands.Moderation.PruneNotSubcommandSameOFSameFlag);
					}
					break;
			}
			return filter(msg) && combinedFilter(msg);
		};

		const position = this.resolvePosition(rawPosition);

		if (args.getFlags(...silentFlags) && !silent) silent = true;
		// Fetch and filter messages using purgeBulk
		const filteredMessages = await this.fetchMessages(message.channel as TextChannel, {
			limit,
			[position]: targetMessage.id,
			filter: finalFilter
		});

		if (filteredMessages.size === 0) this.error(LanguageKeys.Commands.Moderation.PruneNoDeletes);

		if (silent && filteredMessages.size !== 100) {
			filteredMessages.set(message.id, message);
		}

		const filteredKeys = this.resolveKeys(filteredMessages, position, limit);
		if (silent) return null;

		// Perform a bulk delete, throw if it returns unknown message, and log deleted messages
		await this.bulkDeleteMessages(message.channel as TextChannel, filteredKeys);

		const content = args.t(LanguageKeys.Commands.Moderation.PruneAlert, {
			count: filteredKeys.size,
			total: limit
		});
		return sendTemporaryMessage(message, content, seconds(10));
	}

	private async fetchMessages(
		channel: TextChannel,
		options: { limit: number; before?: string; after?: string; filter: BooleanFn<[GuildMessage]> }
	): Promise<Collection<string, GuildMessage>> {
		const { before, after, filter, limit } = options;
		let remainingLimit = limit;
		const fetchedMessages = new Collection<string, GuildMessage>();

		const fetchAndFilter = async (before?: string, after?: string) => {
			let messages = new Collection<string, Message>();
			try {
				messages = await channel.messages.fetch({ limit: 100, before, after, cache: true });
			} catch (error) {
				if ((error as any).code === RESTJSONErrorCodes.ProvidedTooFewOrTooManyMessagesToDelete) {
					messages = new Collection<string, Message>([[channel.lastMessageId!, channel.lastMessage!]]);
				} else throw error;
			}
			const filteredMessage = (msg: Message) => isGuildMessage(msg) && filter(msg);

			const filteredMessages = messages.filter(filteredMessage).sort((a, b) => b.createdTimestamp - a.createdTimestamp);

			for (const message of filteredMessages.values()) {
				if (remainingLimit <= 0) break;
				fetchedMessages.set(message.id, message as GuildMessage);
				remainingLimit--;
			}

			if (remainingLimit > 0 && filteredMessages.size > 0) {
				await setTimeout(2000);
				await fetchAndFilter(before && filteredMessages.last()?.id, after && filteredMessages.first()?.id);
			}
		};

		await fetchAndFilter(before, after);
		return fetchedMessages;
	}

	private async bulkDeleteMessages(
		channel: TextChannel,
		messages: Collection<string, Message<boolean>>
	): Promise<Collection<string, Message | PartialMessage | undefined>> {
		const logger = getLogger(channel.guild.id);
		logger.prune.set(channel.id, { userId: channel.client.user!.id });
		const deletedMessages = new Collection<string, Message | PartialMessage | undefined>();

		const messageIds = Array.from(messages.filter((msg) => msg.bulkDeletable).keys());

		for (const chunked of chunk(messageIds, 100)) {
			try {
				const deleted = await channel.bulkDelete(chunked);
				deletedMessages.concat(deleted.filter(filterNullAndUndefined));
			} catch (error) {
				logger.prune.unset(channel.id);
				if ((error as DiscordAPIError).code !== RESTJSONErrorCodes.UnknownMessage) throw error;
			}
		}

		return deletedMessages;
	}

	private async getFilters(args: WolfSubcommand.Args): Promise<BooleanFn<[GuildMessage]>> {
		const fns: BooleanFn<[GuildMessage]>[] = [];

		const user = args.finished ? null : await args.pick('user').catch(() => null);
		if (user !== null) fns.push((mes: GuildMessage) => mes.author.id === user.id);

		const maximumAge = await this.getAge(args);
		const oldestMessageTimestamp = Date.now() - maximumAge;
		fns.push((mes: GuildMessage) => mes.createdTimestamp > oldestMessageTimestamp);

		if (args.getFlags(...attachmentsFlags)) fns.push((mes: GuildMessage) => mes.attachments.size > 0);
		else if (args.getFlags(...imageFlags)) fns.push((mes: GuildMessage) => mes.attachments.some((at) => !isNullish(getImageUrl(at.url))));
		if (args.getFlags(...authorFlags)) fns.push((mes: GuildMessage) => mes.author.id === args.message.author.id);
		if (args.getFlags(...botsFlags)) fns.push((mes: GuildMessage) => mes.author.bot);
		if (args.getFlags(...humansFlags)) fns.push((mes: GuildMessage) => !mes.author.bot);
		if (args.getFlags(...invitesFlags)) fns.push((mes: GuildMessage) => UserCommand.kInviteRegExp.test(mes.content));
		if (args.getFlags(...linksFlags)) fns.push((mes: GuildMessage) => UserCommand.kLinkRegExp.test(mes.content));
		if (args.getFlags(...youFlags)) fns.push((mes: GuildMessage) => mes.author.id === process.env.CLIENT_ID);
		if (!args.getFlags(...pinsFlags)) fns.push((mes: GuildMessage) => !mes.pinned);
		if (args.getFlags(...mentionsFlags))
			fns.push((mes: GuildMessage) => mes.mentions.users.size > 0 || mes.mentions.roles.size > 0 || mes.mentions.channels.size > 0);
		if (args.getFlags(...embedsFlags)) fns.push((mes: GuildMessage) => mes.embeds.length > 0);

		const includes = args.getOption(...includesOptions)?.toLowerCase();
		if (!isNullishOrEmpty(includes)) fns.push((mes: GuildMessage) => mes.content.toLowerCase().includes(includes));
		const pattern = args.getOption(...matchOptions);
		if (!isNullishOrEmpty(pattern)) fns.push((mes: GuildMessage) => new RegExp(pattern, 'i').test(mes.content));
		const startswith = args.getOption(...startswithOptions)?.toLowerCase();
		if (!isNullishOrEmpty(startswith)) fns.push((mes: GuildMessage) => mes.content.toLowerCase().startsWith(startswith));
		const endswith = args.getOption(...endswithOptions)?.toLowerCase();
		if (!isNullishOrEmpty(endswith)) fns.push((mes: GuildMessage) => mes.content.toLowerCase().endsWith(endswith));

		return andMix(...fns);
	}

	private resolveKeys(messages: Collection<string, Message>, position: 'before' | 'after', limit: number): Collection<string, Message> {
		const keys = position === 'before' ? [...messages.keys()].slice(0, limit) : [...messages.keys()].slice(messages.size - limit);
		const collection = new Collection<string, Message>();
		for (const key of keys) {
			const message = messages.get(key);
			if (message) {
				collection.set(key, message);
			}
		}
		return collection;
	}

	private resolvePosition(position: Position | null) {
		return position === Position.After ? 'after' : 'before';
	}

	private async getAge(args: WolfSubcommand.Args) {
		const parameter = args.getOption(...ageOptions);
		if (parameter === null) return days(14);

		const argument = this.timespan;
		const result = await argument.run(parameter, {
			args,
			argument,
			command: this,
			commandContext: args.commandContext,
			message: args.message,
			minimum: 0,
			maximum: days(14)
		});
		return result.unwrapRaw();
	}

	private static position = Args.make<Position>((parameter, { argument }) => {
		const position = UserCommand.kCommandPrunePositions[parameter.toLowerCase()];
		if (typeof position === 'undefined') {
			return Args.error({ parameter, argument, identifier: LanguageKeys.Commands.Moderation.PruneInvalidPosition });
		}

		return Args.ok(position);
	});

	private static readonly kInviteRegExp = /(?:discord\.(?:gg|io|me|plus|link)|invite\.(?:gg|ink)|discord(?:app)?\.com\/invite)\/(?:[\w-]{2,})/i;
	private static readonly kLinkRegExp = urlRegex({ requireProtocol: true, tlds: true });
	private static readonly kCommandPrunePositions: Record<string, Position> = {
		before: Position.Before,
		b: Position.Before,
		after: Position.After,
		a: Position.After
	};
}
