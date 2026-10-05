import { auditDiff } from '#lib/api/auditDiff';
import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, canManage, ratelimit } from '#lib/api/utils';
import { DASHBOARD_AUDIT_ACTIONS } from '#lib/database/settings/auditActions';
import { seconds } from '#common';
import { HttpCodes, Route } from '@wolfstar/plugin-api';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import type { APIGuildMember, GuildMemberFlags } from 'discord-api-types/v10';
import type { AuditEventChanges, AuditOutcome, DashboardAuditAction, DashboardAuditChanges, DashboardAuditEntry } from 'wolfstar-database';

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
	const user = member?.user;
	if (!member || !user) return fallbackMember(actorId);
	return {
		user: {
			id: user.id,
			username: user.username,
			global_name: user.globalName ?? null,
			avatar: user.avatar,
			discriminator: user.discriminator
		},
		// `roles.ids` leaves `@everyone` out, whose ID is the guild's:
		roles: [member.guildId, ...member.roles.ids],
		joined_at: member.joinedAt?.toISOString() ?? null,
		nick: member.nickname ?? null,
		avatar: member.avatar,
		flags: Number(member.flags.bitField) as GuildMemberFlags,
		deaf: member.deaf,
		mute: member.mute
	};
}

function fallbackMember(actorId: string): APIGuildMember {
	return {
		user: { id: actorId, username: 'Unknown', global_name: null, avatar: null, discriminator: '0' },
		roles: [],
		joined_at: null,
		nick: null,
		avatar: null,
		flags: 0 as GuildMemberFlags,
		deaf: false,
		mute: false
	};
}

export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(10), 5, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const guildId = request.params.guild;

		const guild = await this.container.gatewayClient.guilds.resolve(guildId);
		if (!guild) return response.error(HttpCodes.BadRequest);

		const member = await this.container.gatewayClient.members.fetch(guildId, request.auth!.id).catch(() => null);
		if (!member) return response.error(HttpCodes.BadRequest);

		if (!(await canManage(guild, member))) return response.error(HttpCodes.Forbidden);

		const limit = Math.min(Math.max(Number.parseInt(request.query.limit as string, 10) || 10, 1), 100);
		const offset = Math.max(Number.parseInt(request.query.offset as string, 10) || 0, 0);

		const collection = this.container.prisma.orm.public.AuditEvent.where({ tenantId: BigInt(guild.id) }).where((event) =>
			event.action.in([...DASHBOARD_AUDIT_ACTIONS])
		);

		const [rows, { total }] = await Promise.all([
			collection
				.orderBy((event) => event.timestamp.desc())
				.limit(limit)
				.offset(offset)
				.all(),
			collection.aggregate((aggregate) => ({ total: aggregate.count() }))
		]);

		const uniqueActorIds = [...new Set(rows.map((r) => r.actorId.toString()))];
		const resolvedMembers = await Promise.all(
			uniqueActorIds.map((id) => this.container.gatewayClient.members.fetch(guildId, id).catch(() => null))
		);
		const memberMap = new Map(uniqueActorIds.map((id, i) => [id, serializeMember(resolvedMembers[i], id)]));

		return response.status(HttpCodes.OK).json({
			entries: rows.map((row) => {
				const actorId = row.actorId.toString();
				return {
					id: row.id,
					guildId: guildId,
					action: row.action as DashboardAuditAction,
					outcome: row.outcome as AuditOutcome,
					member: memberMap.get(actorId) ?? fallbackMember(actorId),
					changes: patchToChanges(row.changes as AuditEventChanges | null),
					reason: row.reason ?? null,
					timestamp: new Date(row.timestamp).toISOString()
				} satisfies DashboardAuditEntry;
			}),
			total
		});
	}
}
