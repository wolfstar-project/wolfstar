import { getCommandEntries, type FlattenedCommand } from '#lib/api/commands';
import { ratelimit } from '#lib/api/utils';
import { getCategory } from '#lib/database/utils/matchers/Command';
import { seconds } from 'wolfstar-shared';
import { Route } from '@wolfstar/plugin-api';

/**
 * Lists the chat input commands of the bot.
 *
 * @remarks
 *
 * The original bot listed its message commands, and the entries keep their fields (`FlattenedCommand`), read from what
 * a slash command registers with Discord and from the texts of `commands/help`, see `getCommandEntries`:
 *
 * - A command with subcommands is an entry for each of them (`ban add`, `ban remove`), as the commands menu lists them,
 *   and `command` names the command the settings disable.
 * - The entries are sorted by name, so the subcommands of a command are listed together.
 * - The texts are written in the requested language (`lang`), the default one when the bot does not have it.
 */
export class UserRoute extends Route {
	@ratelimit(seconds(2), 2)
	public run(request: Route.Request, response: Route.Response) {
		const { lang, category } = request.query;
		const locale = typeof lang === 'string' && this.container.i18n.languages.has(lang) ? lang : null;
		const t = this.container.i18n.getT(locale ?? 'en-US');

		const commands = this.container.stores.get('commands');
		const filtered = category ? commands.filter((cmd) => getCategory(cmd) === category) : commands;

		const entries: FlattenedCommand[] = [];
		for (const command of filtered.values()) {
			const data = command.registry?.chatInput?.toJSON();
			if (data) entries.push(...getCommandEntries(command, data, locale, t));
		}

		return response.json(entries.sort((a, b) => a.name.localeCompare(b.name)));
	}
}
