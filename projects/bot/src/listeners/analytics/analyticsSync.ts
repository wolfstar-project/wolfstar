import { takeMessageCount } from '#utils/analytics';
import { Actions, Events, Points, Tags } from '#lib/types';
import { Point } from '@influxdata/influxdb-client';
import { ApplyOptions } from '@wolfstar/decorators';
import { InfluxListener } from '@wolfstar/shared-influx-pieces';

@ApplyOptions<InfluxListener.Options>({ emitter: 'client', event: Events.AnalyticsSync })
export class UserAnalyticsEvent extends InfluxListener {
	public run(guilds: number, users: number) {
		this.writePoints([this.syncGuilds(guilds), this.syncUsers(users), this.syncMessageCount()]);

		return this.flush();
	}

	private syncGuilds(value: number) {
		return (
			new Point(Points.Guilds)
				.tag(Tags.Action, Actions.Sync)
				// TODO: Adjust for traditional sharding
				.intField('value', value)
		);
	}

	private syncUsers(value: number) {
		return (
			new Point(Points.Users)
				.tag(Tags.Action, Actions.Sync)
				// TODO: Adjust for traditional sharding
				.intField('value', value)
		);
	}

	private syncMessageCount() {
		return new Point(Points.MessageCount) //
			.tag(Tags.Action, Actions.Sync)
			.intField('value', takeMessageCount());
	}
}
