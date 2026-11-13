import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { SoundboardSound } from '@wolfstar/plugin-gateway';

@RegisterAsDispatchListener('guildSoundboardSoundUpdate')
export class UserListener extends EventGatewayListener<'guildSoundboardSoundUpdate'> {
	public async run(previous: SoundboardSound | null, next: SoundboardSound) {
		if (!next.guildId || previous === null || previous.name === next.name) return;

		await sendSimpleLog(next.guildId, 'logsExpressions', (t) => ({
			color: Colors.Yellow,
			author: `${next.name} (${next.soundId})`,
			lines: [t('events/guilds-logs:fieldRenamed', { previous: previous.name, next: next.name })],
			footer: t('events/guilds-logs:soundUpdate')
		}));
	}
}
