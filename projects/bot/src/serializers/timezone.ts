import { Serializer } from '#lib/database';
import { isTimeZone, resolveTimeZone } from 'wolfstar-shared';
import type { Awaitable } from '@sapphire/utilities';

export class UserSerializer extends Serializer<string> {
	public parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const timeZone = resolveTimeZone(input);
		return timeZone === null ? this.error(t('serializers:invalidTimezone', { name: entry.name })) : this.ok(timeZone);
	}

	public isValid(value: string): Awaitable<boolean> {
		return isTimeZone(value);
	}
}
