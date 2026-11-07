import { readSettings } from '#lib/database';
import { readAutoModerationRules } from '#lib/moderation/automod/rules';
import type { GuildMessage } from '#lib/types';
import { Events } from '#lib/types/Enums';
import { describeMessage } from '#utils/debug';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener, LogLevel } from '@wolfstar/http-framework';

/**
 * Tells once for each message what the auto-moderation holds it to. The listeners of the rules are one for each type,
 * so the same line in `ModerationMessageListener` would be written some twenty times.
 */
@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.GuildUserMessage })
export class UserListener extends Listener {
	public async run(message: GuildMessage) {
		const { logger } = this.container;
		if (!logger.has(LogLevel.Debug)) return;

		const [settings, rules] = await Promise.all([readSettings(message.guildId), readAutoModerationRules(message.guildId)]);
		const enabled = rules.filter((rule) => rule.enabled).length;
		logger.debug(`[AutoMod] ${describeMessage(message)}: the module is ${settings.modulesAutomod ? 'on' : 'off'}, ${enabled} rules enabled`);
	}
}
