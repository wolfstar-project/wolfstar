import { fetchApproximateUserCount, fetchShardId } from '#utils/analytics';
import { Actions, Events, Points, Tags } from '#lib/types';
import { Point } from '@influxdata/influxdb-client';
import { ApplyOptions } from '@wolfstar/decorators';
import { InfluxListener } from '@wolfstar/shared-influx-pieces';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { GatewayGuildDeleteDispatchData } from 'discord-api-types/v10';

@ApplyOptions<InfluxListener.Options>({ emitter: 'client', event: Events.GuildDelete })
export class UserAnalyticsEvent extends InfluxListener {
	public async run(_guild: Guild | null, data: GatewayGuildDeleteDispatchData) {
		// An outage, not a guild the bot left:
		if (data.unavailable) return;

		const guildId = data.id;
		const shardId = (await fetchShardId(guildId)).toString();

		const guilds = new Point(Points.Guilds)
			.tag(Tags.Shard, shardId)
			.tag(Tags.Action, Actions.Subtraction)
			// TODO: Adjust for traditional sharding
			.intField('value', await this.container.gatewayClient.guilds.cache.getSize());
		const users = new Point(Points.Users)
			.tag(Tags.Shard, shardId)
			.tag(Tags.Action, Actions.Subtraction)
			// TODO: Adjust for traditional sharding
			.intField('value', await fetchApproximateUserCount());

		return this.writePoints([guilds, users]);
	}
}
