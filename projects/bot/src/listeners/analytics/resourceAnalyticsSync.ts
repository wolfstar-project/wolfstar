import { Actions, Events, Points, Tags } from '#lib/types';
import { Point } from '@influxdata/influxdb-client';
import { ApplyOptions } from '@wolfstar/decorators';
import { InfluxListener } from '@wolfstar/shared-influx-pieces';
import { cpus } from 'node:os';

@ApplyOptions<InfluxListener.Options>({ emitter: 'client', event: Events.ResourceAnalyticsSync })
export class UserAnalyticsEvent extends InfluxListener {
	public run() {
		this.writePoints([this.syncPerCoreLoad(), this.syncMem()]);

		return this.flush();
	}

	private syncPerCoreLoad() {
		const point = new Point(Points.PerCoreCPULoad).tag(Tags.Action, Actions.Sync);

		let index = 0;
		for (const { times } of cpus()) point.floatField(`cpu_${index++}`, (times.user + times.nice + times.sys + times.irq) / times.idle);

		return point;
	}

	private syncMem() {
		// TODO: Adjust for traditional sharding
		const usage = process.memoryUsage();
		return new Point(Points.Memory) //
			.tag(Tags.Action, Actions.Sync)
			.floatField('total', usage.heapTotal)
			.floatField('used', usage.heapUsed);
	}
}
