import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { SoundboardSound } from '@wolfstar/plugin-gateway';

@RegisterAsDispatchListener('guildSoundboardSoundCreate')
export class UserListener extends EventGatewayListener<'guildSoundboardSoundCreate'> {
	public async run(sound: SoundboardSound) {
		if (!sound.guildId) return;

		await sendSimpleLog(sound.guildId, 'logsExpressions', (t) => ({
			color: Colors.Green,
			author: `${sound.name} (${sound.soundId})`,
			lines: [],
			footer: t('events/guilds-logs:soundCreate')
		}));
	}
}
