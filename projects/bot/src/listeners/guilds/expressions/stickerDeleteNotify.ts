import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Sticker } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('stickerDelete')
export class UserListener extends EventGatewayListener<'stickerDelete'> {
	public async run(sticker: Sticker) {
		if (!sticker.guildId) return;

		await sendSimpleLog(sticker.guildId, 'logsExpressions', (t) => ({
			color: Colors.Red,
			author: `${sticker.name} (${sticker.id})`,
			lines: [sticker.description ? t('events/guilds-logs:fieldDescription', { value: sticker.description }) : null],
			footer: t('events/guilds-logs:stickerDelete')
		}));
	}
}
