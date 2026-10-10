import { ratelimit } from '#lib/api/utils';
import { getCategory, getSubCategory } from '#lib/database/utils/matchers/Command';
import { PermissionLevels } from '#lib/types';
import { seconds } from '#common';
import type { Command } from '@wolfstar/http-framework';
import { Route } from '@wolfstar/plugin-api';
import { PermissionFlagsBits } from 'discord-api-types/v10';

type ChatInputCommandData = ReturnType<NonNullable<NonNullable<Command['registry']>['chatInput']>['toJSON']>;

/**
 * Lists the chat input commands of the bot.
 *
 * @remarks
 *
 * The original bot listed its message commands. The entries keep the same fields, read from what a slash command
 * registers with Discord:
 *
 * - Only the top-level commands are listed: the subcommands live in their own pieces and are routed through their parent.
 * - `description` is the description registered for the requested language (`lang`), the default one otherwise.
 * - `permissionLevel` is derived from the default member permissions of the command: everyone without any,
 *   administrator with `Manage Server` or `Administrator`, moderator otherwise.
 * - `alias`, `extendedHelp`, `guarded` and `preconditions` only existed for message commands, so they are sent empty.
 */
export class UserRoute extends Route {
	@ratelimit(seconds(2), 2)
	public run(request: Route.Request, response: Route.Response) {
		const { lang, category } = request.query;
		const commands = this.container.stores.get('commands');
		const filtered = category ? commands.filter((cmd) => getCategory(cmd) === category) : commands;

		const entries = [];
		for (const command of filtered.values()) {
			const data = command.registry?.chatInput?.toJSON();
			if (data) entries.push(UserRoute.process(typeof lang === 'string' ? lang : null, command, data));
		}

		return response.json(entries);
	}

	private static process(lang: string | null, command: Command, data: ChatInputCommandData) {
		const localizations: Partial<Record<string, string | null>> = data.description_localizations ?? {};
		return {
			category: getCategory(command),
			subCategory: getSubCategory(command),
			alias: [],
			description: (lang === null ? null : localizations[lang]) ?? data.description,
			extendedHelp: {},
			guarded: false,
			name: data.name,
			permissionLevel: UserRoute.getPermissionLevel(data.default_member_permissions),
			preconditions: { entries: [], mode: 0, runCondition: 0 }
		};
	}

	private static getPermissionLevel(permissions: string | null | undefined): PermissionLevels {
		if (!permissions) return PermissionLevels.Everyone;

		const administrator = PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator;
		return (BigInt(permissions) & administrator) === 0n ? PermissionLevels.Moderator : PermissionLevels.Administrator;
	}
}
