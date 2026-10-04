import { readSettings } from '#lib/database';
import { getAction, type ActionByType, type GetContextType } from '#lib/moderation/actions';
import type { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import type { ModerationManager } from '#lib/moderation/managers/ModerationManager';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { createTranslator, type GuildChatInputInteraction, type TranslationKey as Key, type Translator } from '#lib/structures/commands/utils';
import type { TypeVariation } from '#utils/moderationConstants';
import { resolveTimeSpan } from '#utils/resolvers';
import type { SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandBuilder } from '@discordjs/builders';
import type { Awaitable } from '@sapphire/utilities';
import { Command, UserError, container, type TransformedArguments } from '@wolfstar/http-framework';
import type { Guild, GuildMember, User } from '@wolfstar/plugin-gateway';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	type APIAttachment,
	type Permissions
} from 'discord-api-types/v10';

/**
 * A moderation command, which applies (or, for the `isUndoAction` ones, reverts) one of the
 * {@link ModerationActions | moderation actions} to a single user.
 *
 * A subclass is a registered slash command, so it declares its options with {@linkcode applyModerationBuilder} and its
 * piece options with `@ApplyOptions`, which goes **above** `@RegisterCommand`:
 *
 * @example
 * ```typescript
 * \@ApplyOptions<ModerationCommand.Options<TypeVariation.Kick>>({ type: TypeVariation.Kick, requiredMember: true })
 * \@RegisterCommand((builder) =>
 * 	applyModerationBuilder(builder, {
 * 		root: 'commands/moderation:kick',
 * 		type: TypeVariation.Kick,
 * 		permissions: PermissionFlagsBits.KickMembers
 * 	})
 * )
 * export class UserCommand extends ModerationCommand<TypeVariation.Kick, null> {
 * 	protected override async checkTargetCanBeModerated(interaction: ModerationCommand.Interaction, context: ModerationCommand.HandlerParameters<null>) {
 * 		const member = await super.checkTargetCanBeModerated(interaction, context);
 * 		if (!(await member?.fetchKickable())) throw context.t('commands/moderation:kickNotKickable');
 * 		return member;
 * 	}
 * }
 * ```
 *
 * The subclasses that are registered as a subcommand of another command (`restrict attachment`) use
 * {@linkcode applyModerationSubcommandBuilder} instead, from the `RegisterAsSubcommand` decorator of
 * `@wolfstar/plugin-subcommands-advanced`.
 *
 * @remarks
 *
 * - One user is moderated per invocation.
 * - Whether the user is notified is the `dm` boolean option, and whether the moderator is shown is the `authored`
 *   boolean option.
 * - The image of the case is the optional `image` attachment.
 * - The permission level check is {@linkcode CommandPermissionLevel.Moderator}, see {@linkcode hasCommandPermissionLevel}.
 */
export abstract class ModerationCommand<Type extends TypeVariation, ValueType> extends Command<ModerationCommand.Options<Type>> {
	/**
	 * The moderation action this command applies.
	 */
	protected readonly action: ActionByType<Type>;

	/**
	 * Whether this command executes an undo action.
	 */
	protected readonly isUndoAction: boolean;

	/**
	 * The key for the action is active language key.
	 */
	protected readonly actionStatusKey: ModerationCommand.TranslationKey;

	/**
	 * Whether this command supports schedules.
	 */
	protected readonly supportsSchedule: boolean;

	/**
	 * The minimum duration for this command.
	 */
	protected readonly minimumDuration: number;

	/**
	 * The maximum duration for this command.
	 */
	protected readonly maximumDuration: number;

	/**
	 * Whether a member is required or not.
	 */
	protected readonly requiredMember: boolean;

	/**
	 * Whether a duration is required or not.
	 */
	protected readonly requiredDuration: boolean;

	public constructor(context: ModerationCommand.LoaderContext, options: ModerationCommand.Options<Type>) {
		super(context, { requiredMember: false, ...options });

		this.action = getAction(options.type);
		this.isUndoAction = options.isUndoAction ?? false;
		this.actionStatusKey = options.actionStatusKey ?? (this.isUndoAction ? 'moderation:actionIsNotActive' : 'moderation:actionIsActive');
		this.supportsSchedule = this.action.isUndoActionAvailable && !this.isUndoAction;
		this.minimumDuration = this.action.minimumDuration;
		this.maximumDuration = this.action.maximumDuration;
		this.requiredMember = options.requiredMember ?? false;
		this.requiredDuration = this.action.durationRequired && !this.isUndoAction;
	}

	public override async chatInputRun(interaction: ModerationCommand.Interaction, args: ModerationCommand.Arguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Moderator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const settings = await this.readMessageSettings(interaction.guildId);

		// The response is public when the guild wants the moderation messages displayed, otherwise only the moderator sees it:
		const deferred = await interaction.defer(settings.messageDisplay ? undefined : { flags: MessageFlags.Ephemeral });

		const guild = await container.gatewayClient.guilds.fetch(interaction.guildId);
		const target = await container.gatewayClient.users.fetch(args.user.id);
		const moderator = await container.gatewayClient.users.fetch(interaction.user.id);

		let content: string;
		try {
			const parameters = this.resolveParameters(t, guild, moderator, target, args);
			await this.inhibit(interaction, parameters);
			const preHandled = await this.preHandle(interaction, parameters);
			const handled = { ...parameters, preHandled };

			try {
				await this.checkTargetCanBeModerated(interaction, handled);
				const log = await this.handle(interaction, handled);
				content = this.formatOutput(t, settings, target, log);
			} catch (error) {
				content = this.formatFailure(t, target, error);
			}

			try {
				await this.postHandle(interaction, handled);
			} catch {
				// noop
			}
		} catch (error) {
			content = this.formatFailure(t, target, error);
		}

		return deferred.update({ content });
	}

	/**
	 * Runs before anything else is handled, it aborts the command by throwing the translated reason.
	 *
	 * @param interaction - The interaction that triggered the command.
	 * @param context - The context for the moderation command.
	 */
	protected inhibit(interaction: ModerationCommand.Interaction, context: ModerationCommand.Parameters): Awaitable<void>;
	protected inhibit() {
		// noop
	}

	/**
	 * Handles an action before taking the moderation action.
	 *
	 * @param interaction - The interaction that triggered the command.
	 * @param context - The context for the moderation command.
	 * @returns The value that will be set in {@linkcode ModerationCommand.HandlerParameters.preHandled}.
	 */
	protected preHandle(interaction: ModerationCommand.Interaction, context: ModerationCommand.Parameters): Awaitable<ValueType>;
	protected preHandle() {
		return null as ValueType;
	}

	/**
	 * Handles the moderation action.
	 *
	 * @param interaction - The interaction that triggered the command.
	 * @param context - The context for the moderation command.
	 */
	protected handle(
		interaction: ModerationCommand.Interaction,
		context: ModerationCommand.HandlerParameters<ValueType>
	): Promise<ModerationManager.Entry> | ModerationManager.Entry;

	protected async handle(interaction: ModerationCommand.Interaction, context: ModerationCommand.HandlerParameters<ValueType>) {
		const dataContext = this.getHandleDataContext(interaction, context);

		const options = this.resolveOptions(interaction, context);
		const data = await this.getActionData(interaction, context, dataContext);
		const isActive = await this.isActionActive(interaction, context, dataContext);

		if (this.isUndoAction) {
			// If this command is an undo action, and the action is not active, throw an error.
			if (!isActive) {
				throw context.t(this.getActionStatusKey(context));
			}

			// @ts-expect-error mismatching types due to unions
			return this.action.undo(context.guild, options, data);
		}

		// If this command is not an undo action, and the action is active, throw an error.
		if (isActive) {
			throw context.t(this.getActionStatusKey(context));
		}

		// @ts-expect-error mismatching types due to unions
		return this.action.apply(context.guild, options, data);
	}

	/**
	 * Gets the data context required for some actions, if any.
	 *
	 * @param interaction - The interaction that triggered the command.
	 * @param context - The context for the moderation command.
	 */
	protected getHandleDataContext(
		interaction: ModerationCommand.Interaction,
		context: ModerationCommand.HandlerParameters<ValueType>
	): GetContextType<Type>;
	protected getHandleDataContext(): GetContextType<Type> {
		return null as GetContextType<Type>;
	}

	/**
	 * Checks if the action is active.
	 *
	 * @param interaction - The interaction that triggered the command.
	 * @param context - The context for the moderation command.
	 * @param dataContext - The data context required for some actions, if any.
	 */
	protected isActionActive(
		_interaction: ModerationCommand.Interaction,
		context: ModerationCommand.HandlerParameters<ValueType>,
		dataContext: GetContextType<Type>
	): Awaitable<boolean> {
		return this.action.isActive(context.guild, context.target.id, dataContext as never);
	}

	/**
	 * Gets the key for the action status language key.
	 *
	 * @remarks
	 *
	 * Unless overridden, this method just returns the value of {@linkcode ModerationCommand.actionStatusKey}.
	 *
	 * @param context - The context for the moderation command.
	 */
	protected getActionStatusKey(context: ModerationCommand.HandlerParameters<ValueType>): ModerationCommand.TranslationKey;
	protected getActionStatusKey(): ModerationCommand.TranslationKey {
		return this.actionStatusKey;
	}

	/**
	 * Handles an action after taking the moderation action.
	 *
	 * @param interaction - The interaction that triggered the command.
	 * @param context - The context for the moderation command.
	 */
	protected postHandle(interaction: ModerationCommand.Interaction, context: ModerationCommand.HandlerParameters<ValueType>): unknown;
	protected postHandle() {
		return null;
	}

	/**
	 * Checks whether the target can be moderated by the author of the interaction and by the bot.
	 *
	 * @param interaction - The interaction that triggered the command.
	 * @param context - The context for the moderation command.
	 * @returns The member of the guild the target resolved to, or `null` if the target is not in the guild.
	 * @throws The translated reason why the target cannot be moderated.
	 */
	protected async checkTargetCanBeModerated(
		interaction: ModerationCommand.Interaction,
		context: ModerationCommand.HandlerParameters<ValueType>
	): Promise<GuildMember | null> {
		const { guild, target, t } = context;
		if (target.id === interaction.user.id) {
			throw t('moderation:actionTargetSelf');
		}

		if (target.id === guild.ownerId) {
			throw t('moderation:actionTargetGuildOwner');
		}

		if (target.id === container.gatewayClient.user?.id) {
			throw t('moderation:actionTargetWolf');
		}

		const { members } = container.gatewayClient;
		const member = await members.fetch(guild.id, target.id).catch(() => {
			if (this.requiredMember) throw t('errors:userNotInGuild');
			return null;
		});

		if (member) {
			const targetHighestRolePosition = await getHighestRolePosition(member);

			// Wolf cannot moderate members with higher role position than her:
			const me = await members.fetchMe(guild.id);
			if (targetHighestRolePosition >= (await getHighestRolePosition(me))) {
				throw t('moderation:actionTargetHigherHierarchyWolf');
			}

			// A member who isn't a server owner is not allowed to moderate somebody with higher role than them:
			if (interaction.user.id !== guild.ownerId) {
				const author = await members.fetch(guild.id, interaction.user.id);
				if (targetHighestRolePosition >= (await getHighestRolePosition(author))) {
					throw t('moderation:actionTargetHigherHierarchyAuthor');
				}
			}
		}

		return member;
	}

	protected async getActionData(
		interaction: ModerationCommand.Interaction,
		context: ModerationCommand.Parameters,
		actionContext?: GetContextType<Type>
	): Promise<ModerationAction.Data<GetContextType<Type>>> {
		const { args, target } = context;
		const settings = await this.readMessageSettings(interaction.guildId);
		return {
			// The `authored` option has priority over the setting, `false` hides the name and `true` shows it:
			moderator: (args.authored ?? settings.moderatorNameDisplay) ? context.moderator : null,
			sendDirectMessage:
				// `dm: false` disables
				args.dm !== false &&
				// `dm: true` and the guild setting enable
				(args.dm === true || settings.moderationDm) &&
				// user settings
				(await this.fetchUserModerationDmEnabled(target.id)),
			context: actionContext
		};
	}

	protected resolveOptions(
		_interaction: ModerationCommand.Interaction,
		context: ModerationCommand.HandlerParameters<ValueType>
	): ModerationAction.PartialOptions<Type> {
		return {
			user: context.target,
			moderator: context.moderator,
			reason: context.reason,
			imageURL: context.imageURL,
			duration: context.duration
		} as ModerationAction.PartialOptions<Type>;
	}

	/**
	 * Resolves the options of the slash command into the parameters the hooks receive.
	 *
	 * @param t - The function to translate with, in the language of the author.
	 * @param guild - The guild the command was run in.
	 * @param moderator - The author of the interaction.
	 * @param target - The user to moderate.
	 * @param args - The options of the slash command.
	 * @throws The translated error when the `duration` option is not valid.
	 */
	protected resolveParameters(
		t: Translator,
		guild: Guild,
		moderator: User,
		target: User,
		args: ModerationCommand.Arguments
	): ModerationCommand.Parameters {
		return {
			t,
			guild,
			moderator,
			target,
			args,
			duration: this.resolveParametersDuration(t, args),
			reason: args.reason ?? null,
			imageURL: getImageUrl(args.image)
		};
	}

	/**
	 * Resolves the value for {@linkcode Parameters.duration}.
	 *
	 * @param t - The function to translate with, in the language of the author.
	 * @param args - The options of the slash command.
	 */
	protected resolveParametersDuration(t: Translator, args: ModerationCommand.Arguments): number | null {
		if (!this.supportsSchedule && !this.requiredDuration) return null;
		if (args.duration === undefined) return null;

		const result = resolveTimeSpan(args.duration, { minimum: this.minimumDuration, maximum: this.maximumDuration });
		if (result.isOk()) return result.unwrap();

		throw t(result.unwrapErr() as Key, {
			parameter: args.duration,
			minimum: this.minimumDuration,
			maximum: this.maximumDuration
		});
	}

	/**
	 * Fetches whether the target wants to receive the moderation direct messages.
	 *
	 * @remarks
	 *
	 * The normalized `User` model of the Prisma 8 contract only has the `report` column, the old `moderation_dm` one is
	 * not part of it, so every user is considered to accept the direct messages until the column is back.
	 *
	 * @param userId - The ID of the target.
	 */
	protected fetchUserModerationDmEnabled(userId: string): Awaitable<boolean>;
	protected fetchUserModerationDmEnabled() {
		return true;
	}

	/**
	 * Reads the settings that control how the moderation commands respond.
	 *
	 * @remarks
	 *
	 * The keys (`messagesModerationDm`, `messagesModerationReasonDisplay`, `messagesModerationMessageDisplay` and
	 * `messagesModeratorNameDisplay`) are not part of the flattened `GuildData` anymore, since the normalized contract
	 * has no table for them. They are read when a guild has them, and default to: the DM is opt-in, and
	 * everything else is displayed.
	 *
	 * @param guildId - The ID of the guild.
	 */
	protected async readMessageSettings(guildId: string): Promise<ModerationCommand.MessageSettings> {
		const settings: Partial<Record<string, unknown>> = await readSettings(guildId);
		return {
			moderationDm: settings.messagesModerationDm === true,
			reasonDisplay: settings.messagesModerationReasonDisplay !== false,
			messageDisplay: settings.messagesModerationMessageDisplay !== false,
			moderatorNameDisplay: settings.messagesModeratorNameDisplay !== false
		};
	}

	private formatOutput(t: Translator, settings: ModerationCommand.MessageSettings, target: User, log: ModerationManager.Entry) {
		const reason = settings.reasonDisplay ? log.reason : null;
		const key = reason ? 'commands/moderation:moderationOutputWithReason' : 'commands/moderation:moderationOutput';
		return t(key, { count: 1, range: log.id, users: [`\`${target.tag}\``], reason });
	}

	private formatFailure(t: Translator, target: User, error: unknown) {
		const message =
			error instanceof UserError
				? t(error.identifier as Key, error.context as Record<string, unknown>)
				: String(error instanceof Error ? error.message : error);
		const users = [`- ${target.tag} → ${message}`];
		return t('commands/moderation:moderationFailed', { users: users.join('\n'), count: users.length });
	}
}

/**
 * Resolves the position of the highest role of a member, `0` (the position of `@everyone`) when they have none.
 *
 * @param member - The member to get the highest role position of.
 */
async function getHighestRolePosition(member: GuildMember) {
	const role = await member.roles.fetchHighest();
	return role?.position ?? 0;
}

function getImageUrl(attachment: APIAttachment | undefined) {
	if (attachment === undefined || !('url' in attachment)) return null;
	return attachment.content_type?.startsWith('image/') ? attachment.url : null;
}

/**
 * The options for {@linkcode applyModerationBuilder} and {@linkcode applyModerationSubcommandBuilder}.
 */
export interface ModerationBuilderOptions {
	/**
	 * The root key of the name and the description of the command, e.g. `commands/moderation:kick`, which resolves
	 * `commands/moderation:kickName` and `commands/moderation:kickDescription`.
	 */
	root: `${string}:${string}`;

	/**
	 * The type of the action, it must match the one given to the command.
	 */
	type: TypeVariation;

	/**
	 * Whether the command undoes the action, it must match the one given to the command.
	 *
	 * @default false
	 */
	isUndoAction?: boolean;

	/**
	 * The permissions that are required by default to use the command, given to `setDefaultMemberPermissions`. A
	 * server can override them in `Server Settings > Integrations`.
	 *
	 * @remarks This is ignored by {@linkcode applyModerationSubcommandBuilder}, set it in the parent command.
	 */
	permissions?: Permissions | bigint | number | null;

	/**
	 * Adds the extra options that are required, after `user` (and the `duration` if it is required) and before any
	 * optional option, Discord rejects a command that has a required option after an optional one.
	 */
	requiredOptions?: (builder: ModerationBuilder) => ModerationBuilder;

	/**
	 * Adds the extra options that are optional, after `reason` and before `image`, `dm` and `authored`.
	 */
	optionalOptions?: (builder: ModerationBuilder) => ModerationBuilder;
}

/**
 * The builders that can hold the options of a moderation command.
 */
export type ModerationBuilder = SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandBuilder;

/**
 * Applies the name, the description, the scope, the default permissions and every option to the builder of a
 * moderation command, to be used in `@RegisterCommand`.
 *
 * The options are:
 *
 * | Name       | Type       | Shown when                                                  |
 * | ---------- | ---------- | ----------------------------------------------------------- |
 * | `user`     | user       | always, required                                            |
 * | `duration` | string     | the action can be scheduled, required if it needs one       |
 * | `reason`   | string     | always                                                      |
 * | `image`    | attachment | always                                                      |
 * | `dm`       | boolean    | always                                                      |
 * | `authored` | boolean    | always                                                      |
 *
 * Their names and descriptions are the `commands/shared:optionsUser`, `optionsDuration`, `optionsReason`,
 * `optionsImage`, `optionsDm` and `optionsAuthored` keys (`…Name` and `…Description`).
 *
 * @param builder - The builder to apply the data to.
 * @param options - The data to apply.
 */
export function applyModerationBuilder(builder: SlashCommandBuilder, options: ModerationBuilderOptions): SlashCommandOptionsOnlyBuilder {
	const scoped = applyLocalizedBuilder(builder, options.root)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(options.permissions ?? PermissionFlagsBits.BanMembers);
	return applyModerationOptions(scoped, options) as SlashCommandOptionsOnlyBuilder;
}

/**
 * Applies the name, the description and every option to the builder of a moderation command registered as a subcommand,
 * to be used in `RegisterAsSubcommand` and `RegisterAsSubcommandGroup`.
 *
 * @param builder - The builder to apply the data to.
 * @param options - The data to apply, see {@linkcode applyModerationBuilder}.
 */
export function applyModerationSubcommandBuilder(
	builder: SlashCommandSubcommandBuilder,
	options: ModerationBuilderOptions
): SlashCommandSubcommandBuilder {
	return applyModerationOptions(applyLocalizedBuilder(builder, options.root), options) as SlashCommandSubcommandBuilder;
}

function applyModerationOptions(builder: ModerationBuilder, options: ModerationBuilderOptions): ModerationBuilder {
	const action = getAction(options.type);
	const isUndoAction = options.isUndoAction ?? false;
	const requiredDuration = action.durationRequired && !isUndoAction;
	const supportsSchedule = action.isUndoActionAvailable && !isUndoAction;

	let result = builder.addUserOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsUser').setRequired(true));

	if (requiredDuration) {
		result = result.addStringOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsDuration').setRequired(true));
	}

	if (options.requiredOptions) result = options.requiredOptions(result);

	if (supportsSchedule && !requiredDuration) {
		result = result.addStringOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsDuration').setRequired(false));
	}

	result = result.addStringOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsReason').setMaxLength(500).setRequired(false));

	if (options.optionalOptions) result = options.optionalOptions(result);

	return result
		.addAttachmentOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsImage').setRequired(false))
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsDm').setRequired(false))
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsAuthored').setRequired(false));
}

export namespace ModerationCommand {
	/**
	 * The ModerationCommand Options
	 */
	export interface Options<Type extends TypeVariation> extends Command.Options {
		type: Type;
		isUndoAction?: boolean;
		actionStatusKey?: TranslationKey;
		requiredMember?: boolean;
	}

	export type LoaderContext = Command.LoaderContext;

	/**
	 * A key of the generated translation typings.
	 */
	export type TranslationKey = Key;

	/**
	 * The interaction of the command, which is always sent from a guild.
	 */
	export type Interaction = GuildChatInputInteraction;

	/**
	 * The options the slash command receives, see {@linkcode applyModerationBuilder}.
	 */
	export interface Arguments {
		user: TransformedArguments.User;
		duration?: string;
		reason?: string;
		image?: TransformedArguments.Attachment;
		dm?: boolean;
		authored?: boolean;
	}

	/**
	 * The settings that control how the moderation commands respond, see {@linkcode ModerationCommand.readMessageSettings}.
	 */
	export interface MessageSettings {
		moderationDm: boolean;
		reasonDisplay: boolean;
		messageDisplay: boolean;
		moderatorNameDisplay: boolean;
	}

	export interface Parameters {
		/**
		 * The function to translate with, in the language of the author of the interaction.
		 */
		t: Translator;

		/**
		 * The guild the command was run in.
		 */
		guild: Guild;

		/**
		 * The author of the interaction.
		 */
		moderator: User;

		/**
		 * The user to moderate.
		 */
		target: User;

		/**
		 * The raw options of the slash command.
		 */
		args: Arguments;

		/**
		 * The resolved `duration` option, in milliseconds.
		 */
		duration: number | null;

		/**
		 * The `reason` option.
		 */
		reason: string | null;

		/**
		 * The URL of the `image` option, if it is an image.
		 */
		imageURL: string | null;
	}

	export interface HandlerParameters<ValueType> extends Parameters {
		preHandled: ValueType;
	}

	export type PostHandleParameters<ValueType> = HandlerParameters<ValueType>;
}
