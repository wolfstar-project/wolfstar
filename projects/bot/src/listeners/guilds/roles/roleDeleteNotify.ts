import { readSettings } from '#lib/database';
import { createTranslator } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import { fetchT } from '@wolfstar/plugin-i18next';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Role } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('guildRoleDelete')
export class UserListener extends EventGatewayListener<'guildRoleDelete'> {
	public async run(role: Role | null) {
		// The role was not cached, its name is unknown:
		if (role === null) return;

		const settings = await readSettings(role);
		const logger = await getLogger(role);
		await logger.send({
			key: 'logsRoleDelete',
			channelId: settings.logsRoleDelete,
			makeMessage: async () => {
				const t = createTranslator(await fetchT(logger.guild));
				return new EmbedBuilder()
					.setColor(Colors.Red)
					.setAuthor({ name: `${role.name} (${role.id})`, iconURL: logger.guild.iconURL({ size: 64, extension: 'png' }) ?? undefined })
					.setFooter({ text: t('events/guilds-logs:roleDelete') })
					.setTimestamp();
			}
		});
	}
}
