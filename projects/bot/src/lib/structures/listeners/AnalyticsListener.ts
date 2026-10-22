import { InfluxListener, isInfluxInitialized } from '@wolfstar/shared-influx-pieces';

/**
 * A listener of the analytics, which is only enabled when `container.influx` exists.
 *
 * @remarks `InfluxListener` decides it with `isInfluxInitialized()`, but spreads the options of the piece after, and the
 * loader gives every piece `enabled: true`: with analytics off, the listener would be enabled with no client to write to.
 */
export abstract class AnalyticsListener extends InfluxListener {
	public constructor(context: InfluxListener.LoaderContext, options: InfluxListener.Options) {
		super(context, { ...options, enabled: isInfluxInitialized() });
	}
}

export declare namespace AnalyticsListener {
	type LoaderContext = InfluxListener.LoaderContext;
	type Options = Omit<InfluxListener.Options, 'enabled'>;
}
