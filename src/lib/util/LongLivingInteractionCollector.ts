import { minutes } from '#utils/common';
import { container } from '@sapphire/framework';
import { noop } from '@sapphire/utilities';
import type { MessageComponentInteraction } from 'discord.js';

export type LongLivingInteractionCollectorListener = (interaction: MessageComponentInteraction) => void;

export class LongLivingInteractionCollector {
	public listener: LongLivingInteractionCollectorListener | null;
	public endListener: (() => void) | null;

	private _timer: NodeJS.Timeout | null = null;

	public constructor(listener: LongLivingInteractionCollectorListener | null = null, endListener: (() => void) | null = null) {
		this.listener = listener;
		this.endListener = endListener;
		container.client.lliCollectors.add(this);
	}

	public setListener(listener: LongLivingInteractionCollectorListener | null) {
		this.listener = listener;
		return this;
	}

	public setEndListener(listener: () => void) {
		this.endListener = listener;
		return this;
	}

	public get ended(): boolean {
		return !container.client.lliCollectors.has(this);
	}

	public send(interaction: MessageComponentInteraction): void {
		if (this.listener) this.listener(interaction);
	}

	public setTime(time: number) {
		if (this._timer) clearTimeout(this._timer);
		if (time === -1) this._timer = null;
		else this._timer = setTimeout(() => this.end(), time);
		return this;
	}

	public end() {
		if (!container.client.lliCollectors.delete(this)) return this;

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

	public static collectOne({ filter = () => true, time = minutes(5) }: LLICCollectOneOptions = {}) {
		return new Promise<MessageComponentInteraction | null>((resolve) => {
			const llic = new LongLivingInteractionCollector(
				(interaction) => {
					if (filter(interaction)) {
						resolve(interaction);
						llic.setEndListener(noop).end();
					}
				},
				() => {
					resolve(null);
				}
			).setTime(time);
		});
	}
}

export interface LLICCollectOneOptions {
	filter?: (interaction: MessageComponentInteraction) => boolean;
	time?: number;
}
