import type { ReadonlyGuildData } from 'wolfstar-database';

/**
 * The commands of the moderation module (`modules.moderation`): the ones that take a moderation action by hand, and the
 * ones that show or edit the cases and the message histories that go with them. They are denied while the server has
 * the module turned off.
 *
 * @remarks
 *
 * They are named by their top-level command, which is what the `commandsEnabled` precondition is given. `/report` and
 * `/reports` are of the reports (see {@linkcode ReportsModuleCommands}), and `/permissions` only shows what a member can
 * do, so they are not here.
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
 * The commands of the reports module (`modules.reports`): `/report`, which is also the `Report Message` and `Report User`
 * context menu commands. `/reports` lists the reports and manages who is blocked from them, so a module that is off can
 * still be looked after, and a report that was already sent can still be closed.
 */
export const ReportsModuleCommands: ReadonlySet<string> = new Set(['report']);

/**
 * Why a command is denied by a module the server turned off, see {@linkcode ModerationModuleCommands} and
 * {@linkcode ReportsModuleCommands}.
 *
 * @param settings - The modules of the server.
 * @param name - The name of the top-level command.
 * @returns The identifier of the denial, or `null` when no module denies the command.
 */
export function getDisabledModuleDenial(
	settings: Pick<ReadonlyGuildData, 'modulesModeration' | 'modulesReports'>,
	name: string
): 'preconditions:disabledModuleModeration' | 'preconditions:disabledModuleReports' | null {
	if (!settings.modulesModeration && ModerationModuleCommands.has(name)) return 'preconditions:disabledModuleModeration';
	if (!settings.modulesReports && ReportsModuleCommands.has(name)) return 'preconditions:disabledModuleReports';
	return null;
}
