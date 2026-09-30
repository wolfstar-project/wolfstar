import type { ModerationManager } from '#lib/moderation';
import { getModeration } from '#utils/functions';
import { err, ok, type Result } from '@sapphire/result';
import { UserError } from '@wolfstar/http-framework';
import type { GuildResolvable } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';

const IntegerPattern = /^-?\d+$/;

export async function resolveCaseId(parameter: string, t: TFunction<AnyNamespace>, guild: GuildResolvable): Promise<Result<number, UserError>> {
	const maximum = await getModeration(guild).getCurrentId();
	if (maximum === 0) return err(new UserError({ identifier: 'arguments:caseNoEntries' }));

	const latestOptions = t('arguments:caseLatestOptions', { returnObjects: true }) as unknown as readonly string[];
	if (latestOptions.includes(parameter)) return ok(maximum);

	if (!IntegerPattern.test(parameter)) return err(new UserError({ identifier: 'arguments:integerError', context: { parameter } }));

	const value = Number(parameter);
	if (value < 1) return err(new UserError({ identifier: 'arguments:integerTooSmall', context: { parameter, minimum: 1, maximum } }));
	if (value > maximum) return err(new UserError({ identifier: 'arguments:integerTooLarge', context: { parameter, minimum: 1, maximum } }));

	return ok(value);
}

export async function resolveCase(
	parameter: string,
	t: TFunction<AnyNamespace>,
	guild: GuildResolvable
): Promise<Result<ModerationManager.Entry, UserError>> {
	const result = await resolveCaseId(parameter, t, guild);
	return result.match({
		ok: async (value) => {
			const entry = await getModeration(guild).fetch(value);
			return entry ? ok(entry) : err(new UserError({ identifier: 'arguments:caseUnknownEntry', context: { parameter } }));
		},
		err: (error) => err(error)
	});
}
