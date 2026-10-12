import { readSettings } from '#lib/database';
import { fetchCaseMemberRoleIds } from '#lib/moderation/common/roles';
import { getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildBan } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('guildBanAdd')
export class UserListener extends EventGatewayListener<'guildBanAdd'> {
	public async run({ guild, user }: GuildBan) {
		if (!guild?.available) return;

		const settings = await readSettings(guild);
		if (!guild.available || !settings.moderationTrackBans) return;

		const moderation = await getModeration(guild);
		await moderation.waitLock();

		if (moderation.checkSimilarEntryHasBeenCreated(TypeVariation.Ban, user.id)) return;

		// A ban made in Discord keeps the roles too, when the member is still cached:
		const extraData = await fetchCaseMemberRoleIds(guild, user.id);
		await moderation.insert(moderation.create({ user: user.id, type: TypeVariation.Ban, extraData }));
	}
}
