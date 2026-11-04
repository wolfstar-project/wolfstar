import { renderMemberEvent } from '#lib/moderation/logs/members';
import { readSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { Events } from '#lib/types';
import { getLogger } from '#utils/functions';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { GuildMember } from '@wolfstar/plugin-gateway';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.NotMutedMemberAdd })
export class UserListener extends Listener {
	public async run(member: GuildMember) {
		const occurredAt = Date.now();
		const settings = await readSettings(member);
		const logChannelId = settings.logsMemberAdd;
		const logger = await getLogger(member);
		await logger.send({
			key: 'logsMemberAdd',
			channelId: logChannelId,
			makeMessage: async () => {
				const t = await fetchGuildT({ id: member.guildId });
				const user = member.user ?? (await member.fetchUser());
				return renderMemberEvent(t, user, Number(user.flags.bitField), { type: 'joined', createdAt: user.createdTimestamp }, occurredAt);
			}
		});
	}
}
