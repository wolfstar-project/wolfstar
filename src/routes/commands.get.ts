import { ratelimit } from '#lib/api/utils';
import { getT } from '#lib/i18n/translate';
import type { WolfCommand } from '#lib/structures';
import { PermissionLevels } from '#lib/types';
import { seconds } from '#utils/common';
import type { Command } from '@sapphire/framework';
import { Route } from '@sapphire/plugin-api';
import type { TFunction } from '@sapphire/plugin-i18next';
import type { Locale } from 'discord.js';

export class UserRoute extends Route {
	@ratelimit(seconds(2), 2)
	public run(request: Route.Request, response: Route.Response) {
		const { lang, category } = request.query;
		const commands = this.container.stores.get('commands');
		const language = getT(lang as Locale);
		const filtered = (category ? commands.filter((cmd) => cmd.category === category) : commands).filter(
			(cmd) => (cmd as WolfCommand).permissionLevel < PermissionLevels.BotOwner
		);

		return response.json(filtered.map(UserRoute.process.bind(null, language)));
	}

	private static process(t: TFunction, cmd: Command) {
		const command = cmd as WolfCommand;
		return {
			category: command.category,
			subCategory: command.subCategory,
			alias: command.aliases,
			description: t(command.description),
			extendedHelp: t(command.detailedDescription, { prefix: process.env.CLIENT_PREFIX }),
			guarded: command.guarded,
			name: command.name,
			permissionLevel: command.permissionLevel,
			preconditions: command.preconditions
		};
	}
}
