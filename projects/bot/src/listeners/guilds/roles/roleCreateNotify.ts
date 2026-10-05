import { readSettings } from '#lib/database';
import { createTranslator, type TranslationKey, type Translator } from '#lib/structures/commands/utils';
import { toPermissionsArray } from '#utils/bits';
import { Colors } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import { fetchT } from '@wolfstar/plugin-i18next';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Role } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('guildRoleCreate')
export class UserListener extends EventGatewayListener<'guildRoleCreate'> {
	public async run(next: Role) {
		const settings = await readSettings(next);
		const logger = await getLogger(next);
		await logger.send({
			key: 'logsRoleCreate',
			channelId: settings.logsRoleCreate,
			makeMessage: async () => {
				const t = createTranslator(await fetchT(logger.guild));
				const changes: string[] = [...this.getRoleInformation(t, next)];
				return new EmbedBuilder()
					.setColor(Colors.Green)
					.setAuthor({ name: `${next.name} (${next.id})`, iconURL: logger.guild.iconURL({ size: 64, extension: 'png' }) ?? undefined })
					.setDescription(changes.join('\n'))
					.setFooter({ text: t('events/guilds-logs:roleCreate') })
					.setTimestamp();
			}
		});
	}

	private *getRoleInformation(t: Translator, role: Role) {
		if (role.color !== 0x000000) yield t('events/guilds-logs:roleCreateColor', { value: role.hexColor });
		if (role.hoist) yield t('events/guilds-logs:roleCreateHoist');
		if (role.mentionable) yield t('events/guilds-logs:roleCreateMentionable');

		if (role.permissions.bitField !== 0n) {
			const values = toPermissionsArray(role.permissions.bitField).map((key) => t(`permissions:${key}` as TranslationKey));
			yield t('events/guilds-logs:roleCreatePermissions', { values, count: values.length });
		}

		yield t('events/guilds-logs:roleCreatePosition', { value: role.position });
	}
}
