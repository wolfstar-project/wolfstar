import type { Translator } from '#lib/structures/commands/utils';
import { roleMention } from '@discordjs/formatters';
import type { RoleRule } from 'wolfstar-database';

/**
 * Describes a rule in a line: `@Access ← has @Verified and @Adult, one of @EU or @US, not @Muted`.
 *
 * @param t - The function to translate with.
 * @param rule - The rule.
 */
export function formatRoleRule(t: Translator, rule: RoleRule): string {
	const mentions = (roleIds: readonly string[]) => roleIds.map((roleId) => roleMention(roleId));
	const parts: string[] = [];
	if (rule.requiredRoles.length > 0) parts.push(t('commands/role-rules:lineRequires', { roles: mentions(rule.requiredRoles) }));
	if (rule.anyRoles.length > 0) parts.push(t('commands/role-rules:lineAnyOf', { roles: mentions(rule.anyRoles) }));
	if (rule.forbiddenRoles.length > 0) parts.push(t('commands/role-rules:lineWithout', { roles: mentions(rule.forbiddenRoles) }));
	return `${roleMention(rule.roleId)} ← ${parts.join(', ')}`;
}
