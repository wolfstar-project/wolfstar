import { AnalyticsListener } from '#lib/structures/listeners/AnalyticsListener';
import { Events } from '#lib/types';
import { ApplyOptions } from '@wolfstar/decorators';

@ApplyOptions<AnalyticsListener.Options>({ event: Events.MessageCreate })
export class UserAnalyticsEvent extends AnalyticsListener {
	public run(): void {
		this.container.analytics!.messageCount++;
	}
}
