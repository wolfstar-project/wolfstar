import type { Snowflake } from 'discord-api-types/v10';
import type { Database, Models } from '../../index.js';
import { isRowId } from '../ids.js';
import type { AppealForm } from './types.js';

type Row = Omit<Models.public_AppealForm, 'guild'>;

function toAppealForm(row: Row): AppealForm {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		name: row.name,
		description: row.description,
		icon: row.icon,
		enabled: row.enabled,
		lockReason: row.lockReason,
		types: [...row.types],
		requiredRoles: row.requiredRoles.map(String),
		restrictedRoles: row.restrictedRoles.map(String),
		questions: row.questions,
		position: row.position
	};
}

/**
 * Reads the forms of a guild, in the order the dashboard gave them.
 */
export async function fetchAppealForms(db: Database, guildId: Snowflake): Promise<AppealForm[]> {
	const rows = await db.orm.public.AppealForm.where({ guildId: BigInt(guildId) })
		.orderBy([(form) => form.position.asc(), (form) => form.id.asc()])
		.all();
	return rows.map((row) => toAppealForm(row));
}

/**
 * Reads a form of a guild.
 * @returns The form, `null` when the guild has none with that ID.
 */
export async function fetchAppealForm(db: Database, guildId: Snowflake, id: string): Promise<AppealForm | null> {
	if (!isRowId(id)) return null;

	const row = await db.orm.public.AppealForm.first({ id: BigInt(id), guildId: BigInt(guildId) });
	return row === null ? null : toAppealForm(row);
}

/**
 * What a form becomes once a role is deleted, for {@linkcode forgetAppealFormRole}: it forgets the role, and one that
 * required it alone is disabled, since it would otherwise open to everybody.
 *
 * @returns What changes, `null` when the form does not name the role.
 */
export function removeAppealFormRole(form: Pick<AppealForm, 'requiredRoles' | 'restrictedRoles' | 'enabled'>, roleId: Snowflake) {
	if (!form.requiredRoles.includes(roleId) && !form.restrictedRoles.includes(roleId)) return null;

	const requiredRoles = form.requiredRoles.filter((role) => role !== roleId);
	const restrictedRoles = form.restrictedRoles.filter((role) => role !== roleId);
	return { requiredRoles, restrictedRoles, enabled: form.enabled && (requiredRoles.length > 0 || form.requiredRoles.length === 0) };
}

/**
 * Forgets a role that was deleted in the forms of a guild.
 */
export async function forgetAppealFormRole(db: Database, guildId: Snowflake, roleId: Snowflake): Promise<void> {
	for (const form of await fetchAppealForms(db, guildId)) {
		const change = removeAppealFormRole(form, roleId);
		if (change === null) continue;

		await db.orm.public.AppealForm.where({ id: BigInt(form.id!), guildId: BigInt(guildId) }).updateAndCount({
			requiredRoles: change.requiredRoles.map(BigInt),
			restrictedRoles: change.restrictedRoles.map(BigInt),
			enabled: change.enabled
		});
	}
}
