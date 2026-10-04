import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * Whether a user receives the direct messages about the moderation actions taken on them, the `report` column of the
 * `User` model. A user without a row receives them, which is the default of the column.
 *
 * @param userId - The ID of the user.
 */
export async function fetchUserReportEnabled(userId: Snowflake): Promise<boolean> {
	const user = await container.prisma.orm.public.User.first({ id: BigInt(userId) });
	return user?.report ?? true;
}

/**
 * Toggles whether a user receives the direct messages about the moderation actions taken on them.
 *
 * @param userId - The ID of the user.
 * @returns The new value.
 */
export async function toggleUserReportEnabled(userId: Snowflake): Promise<boolean> {
	const report = !(await fetchUserReportEnabled(userId));
	await container.prisma.orm.public.User.upsert({ create: { id: BigInt(userId), report }, update: { report } });
	return report;
}
