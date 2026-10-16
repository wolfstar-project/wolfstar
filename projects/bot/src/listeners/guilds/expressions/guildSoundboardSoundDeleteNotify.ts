import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { SoundboardSound } from '@wolfstar/plugin-gateway';
import type { GatewayGuildSoundboardSoundDeleteDispatchData } from 'discord-api-types/v10';

@RegisterAsGatewayListener('guildSoundboardSoundDelete')
export class UserListener extends EventGatewayListener<'guildSoundboardSoundDelete'> {
	public async run(sound: SoundboardSound | null, data: GatewayGuildSoundboardSoundDeleteDispatchData) {
		await sendSimpleLog(data.guild_id, 'logsExpressions', (t) => ({
			color: Colors.Red,
			author: sound === null ? data.sound_id : `${sound.name} (${data.sound_id})`,
			lines: [],
			footer: t('events/guilds-logs:soundDelete')
		}));
	}
}
