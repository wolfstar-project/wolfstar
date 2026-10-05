import { Tags } from '#lib/types/AnalyticsSchema';
import type { Point } from '@influxdata/influxdb-client';
import { envParseBoolean } from '@wolfstar/env-utilities';
import { Listener } from '@wolfstar/http-framework';

export abstract class AnalyticsListener extends Listener {
	public tags: [Tags, string][] = [];

	public constructor(context: Listener.LoaderContext, options?: AnalyticsListener.Options) {
		super(context, { emitter: 'client', ...options, enabled: envParseBoolean('INFLUX_ENABLED', false) });
	}

	public override onLoad() {
		this.initTags();
		return super.onLoad();
	}

	public writePoint(point: Point) {
		return this.container.analytics!.writeApi.writePoint(this.injectTags(point));
	}

	public writePoints(points: Point[]) {
		points = points.map((point) => this.injectTags(point));
		return this.container.analytics!.writeApi.writePoints(points);
	}

	/**
	 * The shard a guild is on, for the `shard` tag: the structures of the gateway plugin do not hold it.
	 */
	protected async fetchShardId(guildId: string) {
		const shardCount = await this.container.gatewayClient.gateway.getShardCount();
		return Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
	}

	protected injectTags(point: Point) {
		for (const tag of this.tags) {
			point.tag(tag[0], tag[1]);
		}
		return point;
	}

	protected initTags() {
		this.tags.push([Tags.Client, process.env.CLIENT_ID], [Tags.OriginEvent, this.event]);
	}
}

export namespace AnalyticsListener {
	export type LoaderContext = Listener.LoaderContext;
	export type Options = Partial<Omit<Listener.Options, 'enabled'>>;
}
