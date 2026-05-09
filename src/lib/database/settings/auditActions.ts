import type { DashboardAuditAction } from '#lib/database/settings/types';

export const DASHBOARD_AUDIT_ACTIONS = [
	'guild.settings.update',
	'guild.settings.access-denied',
	'guild.settings.add',
	'guild.settings.remove'
] as const satisfies readonly DashboardAuditAction[];

export const guildSettingsUpdate = 'guild.settings.update' satisfies DashboardAuditAction;
export const guildSettingsAdd = 'guild.settings.add' satisfies DashboardAuditAction;
export const guildSettingsRemove = 'guild.settings.remove' satisfies DashboardAuditAction;
export const guildSettingsAccessDenied = 'guild.settings.access-denied' satisfies DashboardAuditAction;
