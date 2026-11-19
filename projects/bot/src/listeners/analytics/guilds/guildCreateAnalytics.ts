import { AnalyticsListener } from '#lib/structures/listeners/AnalyticsListener';
import { fetchApproximateUserCount, fetchShardId } from '#utils/analytics';
import { Actions, Events, Points, Tags } from '#lib/types';
import { Point } from '@influxdata/influxdb-client';
import { ApplyOptions } from '@wolfstar/decorators';
import type { Guild } from '@wolfstar/plugin-gateway';

@ApplyOptions<AnalyticsListener.Options>({ emitter: 'client', event: Events.GuildCreate })
export class UserAnalyticsEvent extends AnalyticsListener {
	public async run(guild: Guild) {
		// Every guild is created once more while the shards connect, discord.js only emitted the ones joined afterwards:
		if (!this.container.gatewayClient.isClientReady()) return;

		const guildId = guild.id;
		const shardId = (await fetchShardId(guildId)).toString();

		const guilds = new Point(Points.Guilds)
			.tag(Tags.Shard, shardId)
			.tag(Tags.Action, Actions.Addition)
			// TODO: Adjust for traditional sharding
			.intField('value', await this.container.gatewayClient.guilds.cache.getSize());
		const count = await fetchApproximateUserCount(this.container.gatewayClient.api.users);
		// Discord is down: the guild count is written alone, the next sync writes the users.
		if (count._tag === 'Unavailable') return this.writePoints([guilds]);

		const users = new Point(Points.Users)
			.tag(Tags.Shard, shardId)
			.tag(Tags.Action, Actions.Addition)
			// TODO: Adjust for traditional sharding
			.intField('value', count.users);

		return this.writePoints([guilds, users]);
	}
}
