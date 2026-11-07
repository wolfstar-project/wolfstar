import { Serializer } from '#lib/database';
import { resolveTimeSpan } from '#utils/resolvers';
import type { Awaitable } from '@sapphire/utilities';
import { isJoinGuardCheckpointTimeout, JoinGuardCheckpointTimeoutLimits } from 'wolfstar-database';

/**
 * The words that turn the timeout of the checkpoint off, besides `0`.
 */
const NeverWords = new Set(['never', 'off', 'none']);

/**
 * How long a member who waits at the checkpoint of the join guard has to pass it, in seconds: `0` never kicks them,
 * else from an hour to a week. A duration is read as the other durations of the settings are (`24h`, `3d`, a number of
 * seconds).
 */
export class UserSerializer extends Serializer<number> {
	public parse(input: string, context: Serializer.UpdateContext) {
		const text = input.trim();
		if (NeverWords.has(text.toLowerCase())) return this.ok(0);

		const seconds = resolveTimeSpan(text).map((milliseconds) => Math.round(milliseconds / 1000));
		return seconds.isOkAnd((value) => isJoinGuardCheckpointTimeout(value)) ? this.ok(seconds.unwrap()) : this.error(this.describe(context));
	}

	public isValid(value: number, context: Serializer.UpdateContext): Awaitable<boolean> {
		if (typeof value === 'number' && isJoinGuardCheckpointTimeout(value)) return true;
		throw this.describe(context);
	}

	public override stringify(value: number, { t }: Serializer.UpdateContext): string {
		return value === 0 ? t('serializers:joinGuardTimeoutNever') : t('globals:durationValue', { value: value * 1000 });
	}

	private describe({ t, entry }: Serializer.UpdateContext) {
		return t('serializers:invalidJoinGuardTimeout', {
			name: entry.name,
			minimum: JoinGuardCheckpointTimeoutLimits.minimum * 1000,
			maximum: JoinGuardCheckpointTimeoutLimits.maximum * 1000
		});
	}
}
