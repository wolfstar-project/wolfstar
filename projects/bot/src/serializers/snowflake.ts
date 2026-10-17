import { Serializer } from '#lib/database';
import { DiscordSnowflake } from '@sapphire/snowflake';
import type { Awaitable } from '@sapphire/utilities';

export class UserSerializer extends Serializer<string> {
	/**
	 * The validator, requiring all numbers and 17 to 20 digits (future-proof).
	 */
	private readonly kRegExp = /^\d{17,20}$/;

	/**
	 * Stanislav's join day, known as the oldest user in Discord, and practically
	 * the lowest snowflake we can get (as they're bound by the creation date).
	 */
	private readonly kMinimum = new Date(2015, 1, 28).getTime();

	public parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const value = input.trim();
		return this.isSnowflake(value) ? this.ok(value) : this.error(t('serializers:invalidSnowflake', { name: entry.name }));
	}

	public isValid(value: string, { t, entry }: Serializer.UpdateContext): Awaitable<boolean> {
		if (this.isSnowflake(value)) return true;
		throw t('serializers:invalidSnowflake', { name: entry.name });
	}

	private isSnowflake(value: string) {
		if (!this.kRegExp.test(value)) return false;

		const timestamp = Number(DiscordSnowflake.deconstruct(value).timestamp);
		return timestamp >= this.kMinimum && timestamp < Date.now();
	}
}
