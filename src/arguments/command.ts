import { LanguageKeys } from '#lib/i18n/languageKeys';
import type { WolfCommand } from '#lib/structures';
import { PermissionLevels } from '#lib/types';
import { OWNERS } from '#root/config';
import { Argument } from '@sapphire/framework';

export class UserArgument extends Argument<WolfCommand> {
	public run(parameter: string, context: CommandArgumentContext) {
		const resolved = this.container.stores.get('commands').get(parameter.toLowerCase()) as WolfCommand | undefined;
		if (resolved !== undefined && this.isAllowed(resolved, context)) return this.ok(resolved);
		return this.error({ parameter, identifier: LanguageKeys.Arguments.Command, context });
	}

	private isAllowed(command: WolfCommand, context: CommandArgumentContext): boolean {
		if (command.permissionLevel !== PermissionLevels.BotOwner) return true;
		return context.owners ?? OWNERS.includes(context.message.author.id);
	}
}

interface CommandArgumentContext extends Argument.Context<WolfCommand> {
	owners?: boolean;
}
