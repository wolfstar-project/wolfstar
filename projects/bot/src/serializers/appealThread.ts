import { Serializer } from '#lib/database';
import type { TranslationKey } from '#lib/structures/commands/utils';
import type { Awaitable } from '@sapphire/utilities';
import { AppealThreadModes, type AppealThreadMode } from 'wolfstar-database';

export class UserSerializer extends Serializer<AppealThreadMode> {
	public parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const value = input.trim().toLowerCase();
		const mode = AppealThreadModes.find((possible) => possible === value);
		return mode === undefined
			? this.error(t('serializers:invalidAppealThread', { name: entry.name, possibles: AppealThreadModes }))
			: this.ok(mode);
	}

	public isValid(value: AppealThreadMode): Awaitable<boolean> {
		return AppealThreadModes.includes(value);
	}

	public override stringify(value: AppealThreadMode, { t }: Serializer.UpdateContext): string {
		return t(`serializers:appealThread${value}` as TranslationKey);
	}
}
