import { minutes } from '#utils/common';
import { noop } from '@sapphire/utilities';

export type LongLivingReactionCollectorListener = (reaction: LLRCData) => void;

/**
 * The long living reaction collectors, to be fed with {@link LongLivingReactionCollector.feed} by the listeners of the
 * reaction events of the gateway.
 */
export const llrCollectors = new Set<LongLivingReactionCollector>();

export class LongLivingReactionCollector {
	public listener: LongLivingReactionCollectorListener | null;
	public endListener: (() => void) | null;

	private _timer: NodeJS.Timeout | null = null;

	public constructor(listener: LongLivingReactionCollectorListener | null = null, endListener: (() => void) | null = null) {
		this.listener = listener;
		this.endListener = endListener;
		llrCollectors.add(this);
	}

	public setListener(listener: LongLivingReactionCollectorListener | null) {
		this.listener = listener;
		return this;
	}

	public setEndListener(listener: () => void) {
		this.endListener = listener;
		return this;
	}

	public get ended(): boolean {
		return !llrCollectors.has(this);
	}

	public send(reaction: LLRCData): void {
		if (this.listener) this.listener(reaction);
	}

	public setTime(time: number) {
		if (this._timer) clearTimeout(this._timer);
		if (time === -1) this._timer = null;
		else this._timer = setTimeout(() => this.end(), time);
		return this;
	}

	public end() {
		if (!llrCollectors.delete(this)) return this;

		if (this._timer) {
			clearTimeout(this._timer);
			this._timer = null;
		}
		if (this.endListener) {
			process.nextTick(this.endListener.bind(null));
			this.endListener = null;
		}
		return this;
	}

	/**
	 * Sends a reaction to every active collector.
	 * @param reaction The reaction that was added.
	 */
	public static feed(reaction: LLRCData) {
		for (const collector of llrCollectors) collector.send(reaction);
	}

	public static collectOne({ filter = () => true, time = minutes(5) }: LLRCCollectOneOptions = {}) {
		return new Promise<LLRCData | null>((resolve) => {
			const llrc = new LongLivingReactionCollector(
				(reaction) => {
					if (filter(reaction)) {
						resolve(reaction);
						llrc.setEndListener(noop).end();
					}
				},
				() => {
					resolve(null);
				}
			).setTime(time);
		});
	}
}

export interface LLRCCollectOneOptions {
	filter?: (reaction: LLRCData) => boolean;
	time?: number;
}

export interface LLRCDataEmoji {
	animated: boolean;
	id: string | null;
	managed: boolean | null;
	name: string | null;
	requireColons: boolean | null;
	roles: string[] | null;
	user: { id: string };
}

/**
 * The data of a reaction added through the gateway. The channel and the guild are referenced by their ids, as the
 * gateway structures are resolved asynchronously from the cache.
 */
export interface LLRCData {
	channelId: string;
	emoji: LLRCDataEmoji;
	guildId: string;
	messageId: string;
	userId: string;
}
