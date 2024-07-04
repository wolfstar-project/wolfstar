import { GuildSettings, readSettings } from '#lib/database';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import { getAction, type ActionByType, type GetContextType } from '#lib/moderation/actions';
import type { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import type { ModerationManager } from '#lib/moderation/managers/ModerationManager';
import { WolfCommand } from '#lib/structures/commands/WolfCommand';
import { PermissionLevels, GuildMessage, type TypedT } from '#lib/types';
import { asc, floatPromise, seconds } from '#utils/common';
import { deleteMessage, isGuildOwner } from '#utils/functions';
import type { TypeVariation } from '#utils/moderationConstants';
import { getImage, getTag, isUserSelf } from '#utils/util';
import { Args, CommandOptionsRunTypeEnum, type Awaitable, type ChatInputCommand } from '@sapphire/framework';
import { free, send } from '@sapphire/plugin-editable-commands';
import { ChatInputCommandInteraction, GuildMember, Message, type User } from 'discord.js';

const Root = LanguageKeys.Moderation;

export abstract class ModerationCommand<Type extends TypeVariation, ValueType> extends WolfCommand {
	protected readonly action: ActionByType<Type>;
	protected readonly isUndoAction: boolean;
	protected readonly actionStatusKey: TypedT;
	protected readonly supportsSchedule: boolean;
	protected readonly minimumDuration: number;
	protected readonly maximumDuration: number;
	protected readonly requiredMember: boolean;
	protected readonly requiredDuration: boolean;

	protected constructor(context: ModerationCommand.LoaderContext, options: ModerationCommand.Options<Type>) {
		super(context, {
			cooldownDelay: seconds(5),
			flags: ['no-author', 'authored', 'no-dm', 'dm'],
			permissionLevel: PermissionLevels.Moderator,
			requiredMember: false,
			runIn: [CommandOptionsRunTypeEnum.GuildAny],
			...options
		});

		this.action = getAction(options.type);
		this.isUndoAction = options.isUndoAction ?? false;
		this.actionStatusKey = options.actionStatusKey ?? (this.isUndoAction ? Root.ActionIsNotActive : Root.ActionIsActive);
		this.supportsSchedule = this.action.isUndoActionAvailable && !this.isUndoAction;
		this.minimumDuration = this.action.minimumDuration;
		this.maximumDuration = this.action.maximumDuration;
		this.requiredMember = options.requiredMember ?? false;
		this.requiredDuration = this.action.durationRequired && !this.isUndoAction;
	}

	public override messageRun(
		message: GuildMessage,
		args: ModerationCommand.Args,
		context: ModerationCommand.RunContext
	): Promise<GuildMessage | null>;

	public override async messageRun(message: GuildMessage, args: ModerationCommand.Args) {
		const resolved = await this.resolveParameters(args);
		const preHandled = await this.preHandle(message, resolved);
		const processed = [] as Array<{ log: ModerationManager.Entry; target: User }>;
		const errored = [] as Array<{ error: Error | string; target: User }>;

		const [shouldAutoDelete, shouldDisplayMessage, shouldDisplayReason] = await readSettings(message.guild, [
			GuildSettings.Messages.ModerationAutoDelete,
			GuildSettings.Messages.ModerationMessageDisplay,
			GuildSettings.Messages.ModerationReasonDisplay
		]);

		const { targets, ...handledRaw } = resolved;
		for (const target of new Set(targets)) {
			try {
				const handled = { ...handledRaw, args, target, preHandled };
				await this.checkTargetCanBeModerated(message, handled);
				const log = await this.handle(message, handled);
				processed.push({ log, target });
			} catch (error) {
				errored.push({ error: error as Error | string, target });
			}
		}

		try {
			await this.postHandle(message, { ...resolved, preHandled });
		} catch {
			// noop
		}

		// If the server was configured to automatically delete messages, delete the command and return null.
		if (shouldAutoDelete) {
			if (message.deletable) floatPromise(deleteMessage(message));
		}

		if (shouldDisplayMessage) {
			const output: string[] = [];
			if (processed.length) {
				const reason = shouldDisplayReason ? processed[0].log.reason! : null;
				const sorted = processed.sort((a, b) => asc(a.log.id, b.log.id));
				const cases = sorted.map(({ log }) => log.id);
				const users = sorted.map(({ target }) => `\`${getTag(target)}\``);
				const range = cases.length === 1 ? cases[0] : `${cases[0]}..${cases[cases.length - 1]}`;
				const key = reason //
					? LanguageKeys.Commands.Moderation.ModerationOutputWithReason
					: LanguageKeys.Commands.Moderation.ModerationOutput;
				output.push(args.t(key, { count: cases.length, range, users, reason }));
			}

			if (errored.length) {
				const users = errored.map(({ error, target }) => `- ${getTag(target)} → ${typeof error === 'string' ? error : error.message}`);
				output.push(args.t(LanguageKeys.Commands.Moderation.ModerationFailed, { users: users.join('\n'), count: users.length }));
			}

			// Else send the message as usual.
			const content = output.join('\n');
			const response = await send(message, content);

			// If the server was configured to automatically delete messages, untrack the editable message so it doesn't
			// get automatically deleted in the event of race-conditions. `send` + `free` is used over
			// `message.channel.send` so it can edit any existing response.
			if (shouldAutoDelete) {
				free(message);
			}

			return response;
		}

		return null;
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction, context: ChatInputCommand.RunContext): Promise<void>;
	public override async chatInputRun() {}

	protected async resolveParameters(args: ModerationCommand.Args): Promise<ModerationCommand.Parameters> {
		return {
			targets: await this.resolveParametersUser(args),
			duration: await this.resolveParametersDuration(args),
			reason: await this.resolveParametersReason(args)
		};
	}

	protected resolveInteractionParameters(interaction: ChatInputCommandInteraction): Promise<ModerationCommand.Parameters>;
	protected resolveInteractionParameters(interaction: ChatInputCommandInteraction) {
		const targets = [interaction.options.getUser('user', true)];
		const duration = interaction.options.getInteger('duration');
		const reason = interaction.options.getString('reason');

		return {
			targets,
			duration: duration ? duration * 1000 : null, // Convert seconds to milliseconds
			reason: reason || null
		};
	}

	protected async checkTargetCanBeModerated(
		source: GuildMessage | ChatInputCommandInteraction,
		context: ModerationCommand.HandlerParameters<ValueType>
	) {
		const guild = source instanceof Message ? source.guild : source.guild!;
		const member = source instanceof Message ? source.member : (source.member as GuildMember);

		if (context.target.id === (source instanceof Message ? source.author.id : source.user.id)) {
			throw context.args.t(Root.ActionTargetSelf);
		}

		if (context.target.id === guild.ownerId) {
			throw context.args.t(Root.ActionTargetGuildOwner);
		}

		if (isUserSelf(context.target.id)) {
			throw context.args.t(Root.ActionTargetWolf);
		}

		const targetMember = await guild.members.fetch(context.target.id).catch(() => {
			if (this.requiredMember) throw context.args.t(LanguageKeys.Misc.UserNotInGuild);
			return null;
		});

		if (targetMember) {
			const targetHighestRolePosition = targetMember.roles.highest.position;

			const me = await guild.members.fetchMe();
			if (targetHighestRolePosition >= me.roles.highest.position) {
				throw context.args.t(Root.ActionTargetHigherHierarchyWolf);
			}

			if (!isGuildOwner(member) && targetHighestRolePosition >= member.roles.highest.position) {
				throw context.args.t(Root.ActionTargetHigherHierarchyAuthor);
			}
		}

		return targetMember;
	}

	protected preHandle(source: GuildMessage | ChatInputCommandInteraction, context: ModerationCommand.Parameters): Awaitable<ValueType>;

	protected preHandle(): Awaitable<ValueType> {
		return null as ValueType;
	}

	protected async handle(
		source: GuildMessage | ChatInputCommandInteraction,
		context: ModerationCommand.HandlerParameters<ValueType>
	): Promise<ModerationManager.Entry> {
		const guild = source instanceof Message ? source.guild : source.guild!;
		const dataContext = this.getHandleDataContext(source, context);

		const options = this.resolveOptions(source, context);
		const data = await this.getActionData(source, context.args, context.target, dataContext);
		const isActive = await this.isActionActive(guild, context, dataContext);

		if (this.isUndoAction) {
			// If this command is an undo action, and the action is not active, throw an error.
			if (!isActive) {
				throw context.args.t(this.getActionStatusKey(context));
			}

			// @ts-expect-error mismatching types due to unions
			return this.action.undo(message.guild, options, data);
		}

		// If this command is not an undo action, and the action is active, throw an error.
		if (isActive) {
			throw context.args.t(this.getActionStatusKey(context));
		}

		// @ts-expect-error mismatching types due to unions
		return this.action.apply(guild, options, data);
	}

	protected getHandleDataContext(
		source: GuildMessage | ChatInputCommandInteraction,
		context: ModerationCommand.HandlerParameters<ValueType>
	): GetContextType<Type>;

	protected getHandleDataContext(): GetContextType<Type> {
		return null as GetContextType<Type>;
	}

	protected isActionActive(
		guild: GuildMessage['guild'],
		context: ModerationCommand.HandlerParameters<ValueType>,
		dataContext: GetContextType<Type>
	): Awaitable<boolean> {
		return this.action.isActive(guild, context.target.id, dataContext as never);
	}

	protected getActionStatusKey(context: ModerationCommand.HandlerParameters<ValueType>): TypedT;
	protected getActionStatusKey(): TypedT {
		return this.actionStatusKey;
	}

	protected postHandle(source: GuildMessage | ChatInputCommandInteraction, context: ModerationCommand.PostHandleParameters<ValueType>): unknown;
	protected postHandle() {
		return null;
	}

	protected async getActionData(
		source: GuildMessage | ChatInputCommandInteraction,
		args: Args,
		target: User,
		context?: GetContextType<Type>
	): Promise<ModerationAction.Data<GetContextType<Type>>> {
		const guild = source instanceof Message ? source.guild : source.guild!;
		const [nameDisplay, enabledDM] = await readSettings(guild, [
			GuildSettings.Messages.ModeratorNameDisplay,
			GuildSettings.Messages.ModerationDM
		]);

		if (source instanceof ChatInputCommandInteraction) {
			const moderator = source.options.getUser('authored') || nameDisplay ? source.user : null;
			const sendDirectMessage =
				!source.options.getBoolean('no-dm') &&
				(source.options.getBoolean('dm') || enabledDM) &&
				(await this.container.db.fetchModerationDirectMessageEnabled(target.id));
			return {
				moderator,
				sendDirectMessage,
				context
			};
		}
		return {
			moderator: args.getFlags('no-author') ? null : args.getFlags('authored') || nameDisplay ? source.author : null,
			sendDirectMessage:
				// --no-dm disables
				!args.getFlags('no-dm') &&
				// --dm and enabledDM enable
				(args.getFlags('dm') || enabledDM) &&
				// user settings
				(await this.container.db.fetchModerationDirectMessageEnabled(target.id)),
			context
		};
	}

	protected resolveOptions(
		source: GuildMessage | ChatInputCommandInteraction,
		context: ModerationCommand.HandlerParameters<ValueType>
	): ModerationAction.PartialOptions<Type> {
		return {
			user: context.target,
			moderator: source instanceof Message ? source.author : source.user,
			reason: context.reason,
			imageURL: source instanceof Message ? getImage(source) : null,
			duration: context.duration
		};
	}

	protected resolveParametersUser(args: ModerationCommand.Args): Promise<User[]> {
		return args.repeat('user', { times: 10 });
	}

	protected async resolveParametersDuration(args: ModerationCommand.Args) {
		if (!this.requiredDuration) {
			if (args.finished) return null;
			if (!this.supportsSchedule) return null;
		}

		const result = await args.pickResult('timespan', { minimum: this.minimumDuration, maximum: this.maximumDuration });
		return result.match({
			ok: (value) => value,
			err: (error) => {
				if (!this.requiredDuration && error.identifier === LanguageKeys.Arguments.TimeSpan) return null;
				throw error;
			}
		});
	}

	protected resolveParametersReason(args: ModerationCommand.Args): Promise<string | null> {
		return args.finished ? Promise.resolve(null) : args.rest('string');
	}
}

export namespace ModerationCommand {
	/**
	 * The ModerationCommand Options
	 */
	export interface Options<Type extends TypeVariation> extends WolfCommand.Options {
		type: Type;
		isUndoAction?: boolean;
		actionStatusKey?: TypedT;
		requiredMember?: boolean;
	}

	export type Args = WolfCommand.Args;
	export type LoaderContext = WolfCommand.LoaderContext;
	export type RunContext = WolfCommand.RunContext;

	export interface Parameters {
		targets: User[];
		duration: number | null;
		reason: string | null;
	}

	export interface HandlerParameters<ValueType> extends Omit<Parameters, 'targets'> {
		args: Args;
		target: User;
		preHandled: ValueType;
	}

	export interface PostHandleParameters<ValueType> extends Parameters {
		preHandled: ValueType;
	}
}
