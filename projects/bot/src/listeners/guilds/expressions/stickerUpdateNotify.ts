import { RegisterAsDispatchListener } from '#utils/worker';
import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { EventGatewayListener } from '@wolfstar/plugin-gateway';
import type { Sticker } from '@wolfstar/plugin-gateway';

@RegisterAsDispatchListener('stickerUpdate')
export class UserListener extends EventGatewayListener<'stickerUpdate'> {
	public async run(previous: Sticker, next: Sticker) {
		if (!next.guildId) return;

		await sendSimpleLog(next.guildId, 'logsExpressions', (t) => {
			const lines = [
				previous.name === next.name ? null : t('events/guilds-logs:fieldRenamed', { previous: previous.name, next: next.name }),
				previous.description === next.description ? null : t('events/guilds-logs:fieldDescription', { value: next.description || '-' })
			];
			if (lines.every((line) => line === null)) return null;

			return { color: Colors.Yellow, author: `${next.name} (${next.id})`, lines, footer: t('events/guilds-logs:stickerUpdate') };
		});
	}
}
