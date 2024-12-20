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
import { Command, UserError, type MessageCommand } from '@sapphire/framework';
import { first } from '@sapphire/iterator-utilities/first';
import { Subcommand } from '@sapphire/plugin-subcommands';
import type { ChatInputCommandInteraction, Message, Snowflake } from 'discord.js';

/**
 * The base class for all Wolf commands with subcommands.
 * @seealso {@link WolfCommand}.
 */
export class WolfSubcommand extends Subcommand<WolfSubcommand.Args, WolfSubcommand.Options> {
	public readonly guarded: boolean;
	public readonly hidden: boolean;
	public readonly permissionLevel: PermissionLevels;
	declare public readonly detailedDescription: TypedT<LanguageHelpDisplayOptions>;
	public override readonly description: TypedT<string>;

	public constructor(context: WolfSubcommand.LoaderContext, options: WolfSubcommand.Options) {
		super(context, { ...WolfCommandConstructorDefaults, ...options });
		this.guarded = options.guarded ?? WolfCommandConstructorDefaults.guarded;
		this.hidden = options.hidden ?? WolfCommandConstructorDefaults.hidden;
		this.permissionLevel = options.permissionLevel ?? WolfCommandConstructorDefaults.permissionLevel;
		this.description = options.description;
	}

	/**
	 * The pre-parse method. This method can be overridden by plugins to define their own argument parser.
	 * @param message The message that triggered the command.
	 * @param parameters The raw parameters as a single string.
	 * @param context The command-context used in this execution.
	 */
	public override messagePreParse(message: Message, parameters: string, context: MessageCommand.RunContext): Promise<WolfSubcommand.Args> {
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

	protected override parseConstructorPreConditions(options: WolfSubcommand.Options): void {
		super.parseConstructorPreConditions(options);
		implementWolfCommandParseConstructorPreConditionsPermissionLevel(this, options.permissionLevel);
	}

	public static readonly PaginatedOptions = implementWolfCommandPaginatedOptions<WolfSubcommand.Options>;
}

export namespace WolfSubcommand {
	export type Options = ExtendOptions<Subcommand.Options>;
	export type Args = WolfArgs;
	export type LoaderContext = Command.LoaderContext;
	export type RunContext = MessageCommand.RunContext;

	export type Interaction = ChatInputCommandInteraction<'cached'>;
}
