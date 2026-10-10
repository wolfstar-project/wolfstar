import { readSettings } from '#lib/database';
import { createTranslator, type TranslationKey, type Translator } from '#lib/structures/commands/utils';
import { toPermissionsArray } from '#utils/bits';
import { differenceBitField } from '#common/comparators';
import { Colors } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import { fetchT } from '@wolfstar/plugin-i18next';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Role } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('guildRoleUpdate')
export class UserListener extends EventGatewayListener<'guildRoleUpdate'> {
	public async run(previous: Role | null, next: Role) {
		// The role was not cached, there is nothing to compare it with:
		if (previous === null) return;

		const settings = await readSettings(next);
		const logger = await getLogger(next);
		await logger.send({
			key: 'logsRoleUpdate',
			channelId: settings.logsRoleUpdate,
			makeMessage: async () => {
				const t = createTranslator(await fetchT(logger.guild));
				const changes: string[] = [...this.differenceRole(t, previous, next)];
				if (changes.length === 0) return null;

				return new EmbedBuilder()
					.setColor(Colors.Yellow)
					.setAuthor({ name: `${next.name} (${next.id})`, iconURL: logger.guild.iconURL({ size: 64, extension: 'png' }) ?? undefined })
					.setDescription(changes.join('\n'))
					.setFooter({ text: t('events/guilds-logs:roleUpdate') })
					.setTimestamp();
			}
		});
	}

	private *differenceRole(t: Translator, previous: Role, next: Role) {
		const [no, yes] = [t('globals:no'), t('globals:yes')];

		if (previous.color !== next.color) {
			yield t('events/guilds-logs:roleUpdateColor', {
				previous: previous.hexColor,
				next: next.hexColor
			});
		}

		if (previous.hoist !== next.hoist) {
			yield t('events/guilds-logs:roleUpdateHoist', {
				previous: previous.hoist ? yes : no,
				next: next.hoist ? yes : no
			});
		}

		if (previous.mentionable !== next.mentionable) {
			yield t('events/guilds-logs:roleUpdateMentionable', {
				previous: previous.mentionable ? yes : no,
				next: next.mentionable ? yes : no
			});
		}

		if (previous.name !== next.name) {
			yield t('events/guilds-logs:roleUpdateName', {
				previous: previous.name,
				next: next.name
			});
		}

		if (previous.permissions.bitField !== next.permissions.bitField) {
			const modified = differenceBitField(previous.permissions.bitField, next.permissions.bitField);
			if (modified.added) {
				const values = toPermissionsArray(modified.added).map((key) => t(`permissions:${key}` as TranslationKey));
				yield t('events/guilds-logs:roleUpdatePermissionsAdded', { values, count: values.length });
			}

			if (modified.removed) {
				const values = toPermissionsArray(modified.removed).map((key) => t(`permissions:${key}` as TranslationKey));
				yield t('events/guilds-logs:roleUpdatePermissionsRemoved', { values, count: values.length });
			}
		}

		if (previous.position !== next.position) {
			yield t('events/guilds-logs:roleUpdatePosition', {
				previous: previous.position,
				next: next.position
			});
		}
	}
}
