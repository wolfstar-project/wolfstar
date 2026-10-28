import { Serializer } from '#lib/database';
import { getJoinGuardRoleProblem } from '#lib/moderation/joinguard/permissions';
import { findJoinGuardSettingsConflict } from '#lib/moderation/joinguard/settings';

/**
 * A role the bot gives and takes, such as the pending and the verified roles of the join guard: it must exist and be
 * one the bot can manage, else the guard would fail on every member.
 */
export class UserSerializer extends Serializer<string> {
	public async parse(input: string, context: Serializer.UpdateContext) {
		const role = await this.findRole(context.guild, input.trim());
		if (role === null) return this.error(context.t('serializers:invalidRole', { name: context.entry.name }));

		const conflict = this.findConflict(role.id, context);
		if (conflict !== null) return this.error(conflict);

		const problem = await getJoinGuardRoleProblem(context.guild.id, role.id);
		return problem === null ? this.ok(role.id) : this.error(this.describe(context, problem));
	}

	public async isValid(value: string, context: Serializer.UpdateContext): Promise<boolean> {
		const conflict = this.findConflict(value, context);
		if (conflict !== null) throw conflict;

		const problem = await getJoinGuardRoleProblem(context.guild.id, value);
		if (problem === null) return true;
		throw this.describe(context, problem);
	}

	/**
	 * The pending and the verified roles cannot be one role, checked with the other one as the settings have it.
	 */
	private findConflict(value: string, { t, entry, entity }: Serializer.UpdateContext): string | null {
		const key = findJoinGuardSettingsConflict({ ...entity, [entry.property]: value } as Parameters<typeof findJoinGuardSettingsConflict>[0]);
		return key === null ? null : t(key, { name: entry.name });
	}

	public override async stringify(value: string, { guild }: Serializer.UpdateContext): Promise<string> {
		return (await this.fetchRole(guild, value))?.name ?? value;
	}

	private describe({ t, entry }: Serializer.UpdateContext, problem: NonNullable<Awaited<ReturnType<typeof getJoinGuardRoleProblem>>>) {
		return problem === 'unknown' ? t('serializers:invalidRole', { name: entry.name }) : t('serializers:roleNotManageable', { name: entry.name });
	}
}
