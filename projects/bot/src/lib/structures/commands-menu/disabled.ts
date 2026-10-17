import { CommandMatcher } from '#lib/database';
import { container } from '@wolfstar/http-framework';
import type { Command } from '@wolfstar/http-framework';

/**
 * The commands a server cannot disable: `settings` is where `commands.disabled` is edited, and `commands` is the menu
 * that edits it, so disabling them would leave nobody able to turn the commands back on.
 */
export const ProtectedCommands: ReadonlySet<string> = new Set(['settings', 'commands']);

/**
 * Finds what disables a command in a list of `commands.disabled`, see `lib/database/utils/matchers/Command.ts`.
 *
 * @param disabled - The names a server disabled: a command, `category.*`, or `*`.
 * @param command - The command to look for.
 * @returns The first name that matches the command, `null` when it is enabled.
 */
export function findDisabledBy(disabled: readonly string[], command: Command): string | null {
	return disabled.find((name) => CommandMatcher.match(name, command)) ?? null;
}

/**
 * Finds the command piece a chat input command is registered by, which is the one the matchers and the preconditions
 * work with: a subcommand is routed through its parent.
 *
 * @param name - The name of the chat input command, as Discord shows it.
 */
export function findCommandPiece(name: string): Command | null {
	for (const piece of container.stores.get('commands').values()) {
		if (piece.router.chatInputName === name) return piece;
	}

	return null;
}
