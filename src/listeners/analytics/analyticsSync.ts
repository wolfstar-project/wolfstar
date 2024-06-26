import { AnalyticsListener } from '#lib/structures';
import { Actions, Events, Points, Tags } from '#lib/types';
import { Point } from '@influxdata/influxdb-client';
import { ApplyOptions } from '@sapphire/decorators';

@ApplyOptions<AnalyticsListener.Options>({ event: Events.AnalyticsSync })
export class UserAnalyticsEvent extends AnalyticsListener {
	// eslint-disable-next-line @typescript-eslint/require-await
	public async run(guilds: number, users: number) {
		this.writePoints([this.syncGuilds(guilds), this.syncUsers(users), this.syncMessageCount()]);

		return this.container.client.analytics!.writeApi.flush();
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
		const { client } = this.container;
		const value = client.analytics!.messageCount;
		client.analytics!.messageCount = 0;

		return new Point(Points.MessageCount) //
			.tag(Tags.Action, Actions.Sync)
			.intField('value', value);
	}
}
