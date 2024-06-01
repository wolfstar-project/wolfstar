import { LanguageKeys } from '#lib/i18n/languageKeys';
import { WolfSubcommand } from '#lib/structures';
import { PermissionLevels, type GuildMessage } from '#lib/types';
import { urlRegex } from '#utils/Links/UrlRegex';
import { days, isGuildMessage, seconds } from '#utils/common';
import { type BooleanFn } from '#utils/common/comparators';
import { getLogger, sendTemporaryMessage } from '#utils/functions';
import { getImageUrl } from '#utils/util';
import { ApplyOptions } from '@sapphire/decorators';
import { Args, Argument, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { filterNullAndUndefined, isNullish } from '@sapphire/utilities';
import { Collection, PermissionFlagsBits, RESTJSONErrorCodes, Message, type PartialMessage, TextChannel, type Snowflake } from 'discord.js';
import { chunk } from '@sapphire/iterator-utilities';
import { setTimeout } from 'node:timers/promises';

const enum Position {
	Before,
	After
}

const ageOptions = ['age'] as const;

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
	permissionLevel: PermissionLevels.Moderator,
	requiredClientPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks],
	runIn: [CommandOptionsRunTypeEnum.GuildAny]
})
export class UserCommand extends WolfSubcommand {
	private get timespan(): Argument<number> {
		return this.container.stores.get('arguments').get('timespan') as Argument<number>;
	}

	public async any(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, () => true);
	}

	public async attachments(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.attachments.size > 0);
	}

	public async images(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.attachments.some((at) => !isNullish(getImageUrl(at.url))));
	}

	public async author(message: GuildMessage, args: WolfSubcommand.Args) {
		const author = args.finished ? message.author : await args.pick('user');
		return this.handlePurge(message, args, (msg) => msg.author.id === author.id);
	}

	public async bots(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.author.bot);
	}

	public async humans(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => !msg.author.bot);
	}

	public async invites(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => UserCommand.kInviteRegExp.test(msg.content));
	}

	public async links(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => UserCommand.kLinkRegExp.test(msg.content));
	}

	public async you(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.author.id === process.env.CLIENT_ID);
	}

	public async pins(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.pinned);
	}

	public async silent(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, () => true, true);
	}

	public async age(message: GuildMessage, args: WolfSubcommand.Args) {
		const maximumAge = await this.getAge(args);
		const oldestMessageTimestamp = Date.now() - maximumAge;
		return this.handlePurge(message, args, (msg) => msg.createdTimestamp > oldestMessageTimestamp);
	}

	public async includes(message: GuildMessage, args: WolfSubcommand.Args) {
		const includes = (await args.rest('string')).toLowerCase();
		return this.handlePurge(message, args, (msg) => msg.content.toLowerCase().includes(includes));
	}

	public async match(message: GuildMessage, args: WolfSubcommand.Args) {
		const pattern = new RegExp(await args.rest('string'), 'i');
		return this.handlePurge(message, args, (msg) => pattern.test(msg.content));
	}

	public async startswith(message: GuildMessage, args: WolfSubcommand.Args) {
		const startswith = (await args.rest('string')).toLowerCase();
		return this.handlePurge(message, args, (msg) => msg.content.toLowerCase().startsWith(startswith));
	}

	public async endswith(message: GuildMessage, args: WolfSubcommand.Args) {
		const endswith = (await args.rest('string')).toLowerCase();
		return this.handlePurge(message, args, (msg) => msg.content.toLowerCase().endsWith(endswith));
	}

	public async mentions(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.mentions.users.size > 0 || msg.mentions.roles.size > 0 || msg.mentions.channels.size > 0);
	}

	public async embeds(message: GuildMessage, args: WolfSubcommand.Args) {
		return this.handlePurge(message, args, (msg) => msg.embeds.length > 0);
	}

	private async handlePurge(message: GuildMessage, args: WolfSubcommand.Args, filter: BooleanFn<[GuildMessage]>, silent = false) {
		const limit = await args.pick('integer', { minimum: 1, maximum: 1000 });
		const rawPosition = args.finished ? null : await args.pick(UserCommand.position);
		const targetMessage = args.finished && rawPosition === null ? message : await args.pick('message');

		const position = this.resolvePosition(rawPosition);

		// Fetch and filter messages using purgeBulk
		const messages = await this.purgeBulk(message, {
			limit,
			[position]: targetMessage.id,
			filter
		});

		if (messages.size === 0) this.error(LanguageKeys.Commands.Moderation.PruneNoDeletes);

		if (silent && messages.size !== 100) {
			messages.set(message.id, message);
		}

		const filteredKeys = this.resolveKeys([...messages.keys()], position, limit);
		if (silent) return null;

		const content = args.t(LanguageKeys.Commands.Moderation.PruneAlert, { count: filteredKeys.length, total: limit });
		return sendTemporaryMessage(message, content, seconds(10));
	}

	private async purgeBulk(
		message: GuildMessage,
		options: { limit: number; before?: string; after?: string; filter: BooleanFn<[GuildMessage]> }
	): Promise<Collection<string, Message | PartialMessage>> {
		const { channel } = message;

		const { before, after, filter: filtered, limit } = options;
		const filter = (msg: Message) => {
			if (isGuildMessage(msg)) return filtered(msg);
			return false;
		};
		let remainingLimit = limit;
		const toDelete: string[] = [];
		const msgDeleted = new Collection<string, Message | PartialMessage>();
		const logger = getLogger(message.guildId);
		let hasError = false;

		logger.prune.set(message.channelId, { userId: message.author.id });
		const BulkDelete = async (messageIds: string[]) => {
			for (const chunked of chunk(messageIds, 100)) {
				const messagesBulked = new Collection<Snowflake, Message | PartialMessage | undefined>();
				try {
					messagesBulked.concat(await (message.channel as TextChannel).bulkDelete(chunked));
				} catch (error) {
					logger.prune.unset(message.channelId);
					hasError = true;
					if ((error as any).code !== RESTJSONErrorCodes.UnknownMessage) throw error;
				} finally {
					if (!hasError) {
						const messages = await Promise.all(
							messagesBulked.filter(filterNullAndUndefined).map(async (msg) => (msg.partial ? msg.fetch() : msg))
						);

						const msgs = new Collection(messages.map((msg) => [msg.id, msg]));

						msgs.reduce((col, message) => col.set(message.id, message), msgDeleted);
					}
				}
			}
		};

		const fetchMessages = async (before?: string, after?: string) => {
			let messages = new Collection<string, Message>();
			try {
				messages = await channel.messages.fetch({ limit: 100, before, after, cache: true });
			} catch (error) {
				if ((error as any).code === RESTJSONErrorCodes.ProvidedTooFewOrTooManyMessagesToDelete) {
					messages = new Collection<string, Message>([[channel.lastMessageId!, channel.lastMessage!]]);
				} else throw error;
			}

			const filteredMessages = messages.filter(filter).sort((a, b) => b.createdTimestamp - a.createdTimestamp);

			for (const message of filteredMessages.values()) {
				if (remainingLimit <= 0) break;
				if (!message.bulkDeletable) continue;

				toDelete.push(message.id);
				remainingLimit--;
			}

			if (remainingLimit > 0 && filteredMessages.size > 0) {
				await setTimeout(2000);
				await fetchMessages(before && filteredMessages.last()?.id, after && filteredMessages.first()?.id);
			}
		};

		await fetchMessages(before, after);
		await BulkDelete(toDelete);

		return msgDeleted;
	}

	private resolveKeys(messages: readonly string[], position: 'before' | 'after', limit: number) {
		return position === 'before' ? messages.slice(0, limit) : messages.slice(messages.length - limit, messages.length);
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
