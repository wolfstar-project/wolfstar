import { readSettings } from '#lib/database';
import { getModeration } from '#utils/functions';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildBan } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('guildBanRemove')
export class UserListener extends EventGatewayListener<'guildBanRemove'> {
	public async run({ guild, user }: GuildBan) {
		if (!guild?.available) return;

		const settings = await readSettings(guild);
		if (!guild.available || !settings.moderationTrackBans) return;

		const moderation = await getModeration(guild);
		await moderation.waitLock();

		if (moderation.checkSimilarEntryHasBeenCreated(TypeVariation.Ban, user.id)) return;
		await moderation.insert(moderation.create({ user, type: TypeVariation.Ban, metadata: TypeMetadata.Undo }));
	}
}
