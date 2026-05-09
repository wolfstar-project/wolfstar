import { authenticated, canManage, ratelimit } from '#lib/api/utils';
import type { AuditEventChanges, AuditOutcome, DashboardAuditAction, DashboardAuditChanges, DashboardAuditEntry } from '#lib/database';
import { DASHBOARD_AUDIT_ACTIONS } from '#lib/database/settings/auditActions';
import { seconds } from '#utils/common';
import { HttpCodes, Route } from '@sapphire/plugin-api';
import type { APIGuildMember } from 'discord-api-types/v10';
import type { GuildMember } from 'discord.js';
import { auditDiff } from 'evlog';

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split('/').filter(Boolean);
	let current: unknown = obj;
	for (const part of parts) {
		if (current === null || current === undefined || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

function patchToChanges(stored: AuditEventChanges | null): DashboardAuditChanges {
	const diff = auditDiff(stored?.before ?? {}, stored?.after ?? {});
	const added: Record<string, unknown> = {};
	const removed: Record<string, unknown> = {};
	const changed: Record<string, { from: unknown; to: unknown }> = {};

	for (const op of diff.patch) {
		const key = op.path.replace(/^\//, '').replaceAll('/', '.');
		if (op.op === 'add') {
			added[key] = op.value;
		} else if (op.op === 'remove') {
			removed[key] = getNestedValue(stored?.before ?? {}, op.path);
		} else {
			changed[key] = { from: getNestedValue(stored?.before ?? {}, op.path), to: op.value };
		}
	}

	const result: DashboardAuditChanges = {};
	if (Object.keys(added).length) result.added = added;
	if (Object.keys(removed).length) result.removed = removed;
	if (Object.keys(changed).length) result.changed = changed;
	return result;
}

function serializeMember(member: GuildMember | null, actorId: string): APIGuildMember {
	if (!member) return fallbackMember(actorId);
	return {
		user: {
			id: member.user.id,
			username: member.user.username,
			global_name: member.user.globalName ?? null,
			avatar: member.user.avatar,
			discriminator: member.user.discriminator
		},
		roles: [...member.roles.cache.keys()],
		joined_at: member.joinedAt?.toISOString() ?? null,
		nick: member.nickname ?? null,
		avatar: member.avatar
	};
}

function fallbackMember(actorId: string): APIGuildMember {
	return {
		user: { id: actorId, username: 'Unknown', global_name: null, avatar: null, discriminator: '0' },
		roles: [],
		joined_at: null,
		nick: null,
		avatar: null
	};
}

export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(10), 5, true)
	public async run(request: Route.Request, response: Route.Response) {
		const guildId = request.params.guild;

		const guild = this.container.client.guilds.cache.get(guildId);
		if (!guild) return response.error(HttpCodes.BadRequest);

		const member = await guild.members.fetch(request.auth!.id).catch(() => null);
		if (!member) return response.error(HttpCodes.BadRequest);

		if (!(await canManage(guild, member))) return response.error(HttpCodes.Forbidden);

		const limit = Math.min(Math.max(Number.parseInt(request.query.limit as string, 10) || 10, 1), 100);
		const offset = Math.max(Number.parseInt(request.query.offset as string, 10) || 0, 0);

		const where = { tenantId: guildId, action: { in: [...DASHBOARD_AUDIT_ACTIONS] } };

		const [rows, total] = await Promise.all([
			this.container.prisma.auditEvent.findMany({
				where,
				orderBy: { timestamp: 'desc' },
				take: limit,
				skip: offset
			}),
			this.container.prisma.auditEvent.count({ where })
		]);

		const uniqueActorIds = [...new Set(rows.map((r) => r.actorId))];
		const resolvedMembers = await Promise.all(uniqueActorIds.map((id) => guild.members.fetch(id).catch(() => null)));
		const memberMap = new Map(uniqueActorIds.map((id, i) => [id, serializeMember(resolvedMembers[i], id)]));

		return response.status(HttpCodes.OK).json({
			entries: rows.map(
				(row) =>
					({
						id: row.id,
						guildId: guildId,
						action: row.action as DashboardAuditAction,
						outcome: row.outcome as AuditOutcome,
						member: memberMap.get(row.actorId) ?? fallbackMember(row.actorId),
						changes: patchToChanges(row.changes as AuditEventChanges | null),
						reason: row.reason ?? null,
						timestamp: row.timestamp.toISOString()
					}) satisfies DashboardAuditEntry
			),
			total
		});
	}
}
