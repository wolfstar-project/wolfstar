import { readSettings } from '#lib/database';
import { findDisabledBy, ProtectedCommands } from '#lib/structures/commands-menu/disabled';
import { AllFlowsPrecondition } from '@wolfstar/http-framework';
import type { Command, Precondition } from '@wolfstar/http-framework';

/**
 * Denies the commands a server disabled with `commands.disabled`, which `/commands` edits.
 *
 * @remarks It is global, so it runs before every command. The commands that edit the setting are never denied, see
 * {@linkcode ProtectedCommands}.
 */
export class UserPrecondition extends AllFlowsPrecondition {
	public constructor(context: AllFlowsPrecondition.LoaderContext, options: AllFlowsPrecondition.Options) {
		super(context, { ...options, position: 10 });
	}

	public override chatInputRun(interaction: Precondition.ChatInputInteraction, command: Command) {
		return this.check(interaction.guildId, command);
	}

	public override contextMenuRun(interaction: Precondition.ContextMenuInteraction, command: Command) {
		return this.check(interaction.guildId, command);
	}

	private async check(guildId: string | null | undefined, command: Command) {
		if (!guildId || ProtectedCommands.has(command.name)) return this.ok();

		const settings = await readSettings(guildId);
		if (findDisabledBy(settings.commandsDisabled, command) === null) return this.ok();

		return this.error({ identifier: 'preconditions:disabledGuild' });
	}
}
