import { AnalyticsListener } from '#lib/structures/listeners/AnalyticsListener';
import { countMessage } from '#utils/analytics';
import { Events } from '#lib/types';
import { ApplyOptions } from '@wolfstar/decorators';

@ApplyOptions<AnalyticsListener.Options>({ emitter: 'client', event: Events.MessageCreate })
export class UserAnalyticsEvent extends AnalyticsListener {
	public run(): void {
		countMessage();
	}
}
