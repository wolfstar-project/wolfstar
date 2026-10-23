import type { ReadonlyGuildData } from 'wolfstar-database';

/**
 * The commands of the moderation module (`modules.moderation`): the ones that take a moderation action by hand, and the
 * ones that show or edit the cases and the message histories that go with them. They are denied while the server has
 * the module turned off.
 *
 * @remarks
 *
 * They are named by their top-level command, which is what the `commandsEnabled` precondition is given. `/report` and
 * `/reports` are of the reports (`reports.*`), and `/permissions` only shows what a member can do, so they are not here.
 * The commands that configure the moderation (`/reasons`, `/warn-thresholds`, `/settings`) are not either: a module that
 * is off can still be set up.
 */
export const ModerationModuleCommands: ReadonlySet<string> = new Set([
	'archive',
	'ban',
	'case',
	'dehoist',
	'kick',
	'lockdown',
	'mute',
	'note',
	'prune',
	'restrict',
	'role',
	'setnickname',
	'slowmode',
	'softban',
	'timeout',
	'unrestrict',
	'vmute',
	'voicekick',
	'warn'
]);

/**
 * Whether a command is of a module the server turned off, see {@linkcode ModerationModuleCommands}.
 *
 * @param settings - The modules of the server.
 * @param name - The name of the top-level command.
 */
export function isCommandOfDisabledModule(settings: Pick<ReadonlyGuildData, 'modulesModeration'>, name: string): boolean {
	return !settings.modulesModeration && ModerationModuleCommands.has(name);
}
