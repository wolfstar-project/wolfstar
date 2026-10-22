import { countMessage } from '#utils/analytics';
import { Events } from '#lib/types';
import { ApplyOptions } from '@wolfstar/decorators';
import { InfluxListener } from '@wolfstar/shared-influx-pieces';

@ApplyOptions<InfluxListener.Options>({ emitter: 'client', event: Events.MessageCreate })
export class UserAnalyticsEvent extends InfluxListener {
	public run(): void {
		countMessage();
	}
}
