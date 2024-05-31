import type { LanguageHelpDisplayOptions } from '#lib/i18n/LanguageHelp';
import { WolfArgs } from '#lib/structures/commands/WolfArgs';
import {
	WolfCommandConstructorDefaults,
	implementWolfCommandError,
	implementWolfCommandPaginatedOptions,
	implementWolfCommandParseConstructorPreConditionsPermissionLevel,
	implementWolfCommandPreParse,
	type ExtendOptions
} from '#lib/structures/commands/base/BaseWolfCommandUtilities';
import { PermissionLevels, type TypedT } from '#lib/types';
import { Command, UserError, type Awaitable, type MessageCommand } from '@sapphire/framework';
import { first } from '@sapphire/iterator-utilities/first';
import { ChatInputCommandInteraction, type Message, type Snowflake } from 'discord.js';

/**
 * The base class for all Wolf commands.
 * @seealso {@link WolfSubcommand} for subcommand support.
 */
export abstract class WolfCommand extends Command<WolfCommand.Args, WolfCommand.Options> {
	public readonly guarded: boolean;
	public readonly hidden: boolean;
	public readonly permissionLevel: PermissionLevels;
	public declare readonly detailedDescription: TypedT<LanguageHelpDisplayOptions>;
	public declare readonly description: TypedT<string>;

	public constructor(context: Command.LoaderContext, options: WolfCommand.Options) {
		super(context, { ...WolfCommandConstructorDefaults, ...options });
		this.guarded = options.guarded ?? WolfCommandConstructorDefaults.guarded;
		this.hidden = options.hidden ?? WolfCommandConstructorDefaults.hidden;
		this.permissionLevel = options.permissionLevel ?? WolfCommandConstructorDefaults.permissionLevel;
	}

	public abstract override messageRun(message: Message, args: WolfCommand.Args, context: MessageCommand.RunContext): Awaitable<unknown>;

	/**
	 * The pre-parse method. This method can be overridden by plugins to define their own argument parser.
	 * @param message The message that triggered the command.
	 * @param parameters The raw parameters as a single string.
	 * @param context The command-context used in this execution.
	 */
	public override messagePreParse(message: Message, parameters: string, context: MessageCommand.RunContext): Promise<WolfCommand.Args> {
		return implementWolfCommandPreParse(this as MessageCommand, message, parameters, context);
	}

	/**
	 * Retrieves the global command id from the application command registry.
	 *
	 * @remarks
	 *
	 * This method is used for slash commands, and will throw an error if the
	 * global command ids are empty.
	 */
	public getGlobalCommandId(): Snowflake {
		const ids = this.applicationCommandRegistry.globalChatInputCommandIds;
		if (ids.size === 0) throw new Error('The global command ids are empty.');
		return first(ids.values())!;
	}

	protected error(identifier: string | UserError, context?: unknown): never {
		implementWolfCommandError(identifier, context);
	}

	protected override parseConstructorPreConditions(options: WolfCommand.Options): void {
		super.parseConstructorPreConditions(options);
		implementWolfCommandParseConstructorPreConditionsPermissionLevel(this, options.permissionLevel);
	}

	public static readonly PaginatedOptions = implementWolfCommandPaginatedOptions<WolfCommand.Options>;
}

export namespace WolfCommand {
	export type Options = ExtendOptions<Command.Options>;
	export type Args = WolfArgs;
	export type LoaderContext = Command.LoaderContext;
	export type RunContext = MessageCommand.RunContext;

	export type Interaction = ChatInputCommandInteraction<'cached'>;
}
