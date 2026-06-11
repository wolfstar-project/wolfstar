import { Prisma } from '#generated/prisma';
import { hashEnvelope, type AuditEnvelopeInput } from '#lib/database/settings/structures/AuditLogEnvelope';
import type { AuditOutcome, ReadonlyGuildData } from '#lib/database/settings/types';
import { buildCommandExecuteEmbed, buildSettingsChangeEmbed, type CommandExecutePayload } from '#utils/functions/auditLogEmbeds';
import { container } from '@sapphire/framework';
import { Events } from '#lib/types';
import { fetchT } from '@sapphire/plugin-i18next';

export class AuditLogManager {
	#guildId: string;
	#settings: ReadonlyGuildData;

	public constructor(settings: ReadonlyGuildData) {
		this.#guildId = settings.id;
		this.#settings = settings;
	}

	public onPatch(settings: ReadonlyGuildData): void {
		this.#guildId = settings.id;
		this.#settings = settings;
	}

	public update(actorId: string, before: Record<string, unknown>, after: Record<string, unknown>): Promise<void> {
		return this.#write({
			actorId,
			action: 'guild.settings.update',
			before,
			after,
			outcome: 'success',
			reason: null
		});
	}

	public add(actorId: string, key: string, value: unknown): Promise<void> {
		return this.#write({
			actorId,
			action: 'guild.settings.add',
			before: {},
			after: { [key]: value },
			outcome: 'success',
			reason: null
		});
	}

	public remove(actorId: string, key: string, value: unknown): Promise<void> {
		return this.#write({
			actorId,
			action: 'guild.settings.remove',
			before: { [key]: value },
			after: {},
			outcome: 'success',
			reason: null
		});
	}

	public accessDenied(actorId: string, reason?: string): Promise<void> {
		return this.#write({
			actorId,
			action: 'guild.settings.access-denied',
			before: {},
			after: {},
			outcome: 'denied',
			reason: reason ?? null
		});
	}

	public command(
		actorId: string,
		payload: { commandName: string; commandId?: string; commandType: 'chat-input' | 'context-menu' | 'message'; channelId: string }
	): Promise<void> {
		return this.#write({
			actorId,
			action: 'guild.command.execute',
			before: {},
			after: payload,
			outcome: 'success',
			reason: null
		});
	}

	async #write(params: {
		actorId: string;
		action: string;
		before: Record<string, unknown>;
		after: Record<string, unknown>;
		outcome: AuditOutcome;
		reason: string | null;
	}): Promise<void> {
		const { actorId, action, outcome, reason } = params;
		const tenantId = this.#guildId;
		const timestamp = new Date();

		const safeBefore = this.#toJsonSafe(params.before) as Record<string, unknown>;
		const safeAfter = this.#toJsonSafe(params.after) as Record<string, unknown>;
		const changes = action === 'guild.settings.access-denied' ? null : { before: safeBefore, after: safeAfter };

		await container.prisma.$transaction(async (tx) => {
			// Acquire a global transaction-level advisory lock.
			// Namespace 0x4155444C = ASCII 'AUDL' = 1096107084.
			// The singleton chain head is shared across all tenants, so all writers
			// must be globally serialised. Released automatically on commit/rollback.
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(1096107084)`;

			const head = await tx.auditChainHead.findUnique({ where: { id: 'default' } });
			const prevHash = head?.hash ?? null;

			const envelope: AuditEnvelopeInput = {
				action,
				actor: { type: 'user', id: actorId },
				outcome,
				tenantId,
				timestamp: timestamp.toISOString(),
				changes: changes as AuditEnvelopeInput['changes'],
				reason,
				requestId: null,
				traceId: null,
				prevHash
			};

			const hash = hashEnvelope(envelope);

			await tx.auditEvent.create({
				data: {
					action,
					actorType: 'user',
					actorId,
					outcome,
					tenantId,
					reason,
					changes: changes ?? Prisma.JsonNull,
					timestamp,
					prevHash,
					hash
				}
			});

			await tx.auditChainHead.upsert({
				where: { id: 'default' },
				update: { hash },
				create: { id: 'default', hash }
			});
		});

		void this.#emitChannelLog(action, { actorId, before: safeBefore, after: safeAfter, reason, timestamp }).catch(() => null);
	}

	async #emitChannelLog(
		action: string,
		params: {
			actorId: string;
			before: Record<string, unknown>;
			after: Record<string, unknown>;
			reason: string | null;
			timestamp: Date;
		}
	): Promise<void> {
		const guild = container.client.guilds.cache.get(this.#guildId);
		if (!guild) return;

		const channelKey = action === 'guild.command.execute' ? 'channelsLogsCommand' : 'channelsLogsSettings';
		const channelId = this.#settings[channelKey];
		if (!channelId) return;

		const t = await fetchT(guild);

		const makeMessage =
			action === 'guild.command.execute'
				? () =>
						buildCommandExecuteEmbed(t, {
							actorId: params.actorId,
							...(params.after as Omit<CommandExecutePayload, 'actorId' | 'timestamp'>),
							timestamp: params.timestamp
						})
				: () =>
						buildSettingsChangeEmbed(t, {
							actorId: params.actorId,
							action: action as any,
							before: params.before,
							after: params.after,
							reason: params.reason,
							timestamp: params.timestamp
						});

		container.client.emit(Events.GuildMessageLog, guild, channelId, channelKey, makeMessage);
	}

	#toJsonSafe(value: unknown): unknown {
		if (typeof value === 'bigint') return value.toString();
		if (Array.isArray(value)) return value.map((v) => this.#toJsonSafe(v));
		if (value !== null && typeof value === 'object') {
			return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, this.#toJsonSafe(v)]));
		}
		return value;
	}
}
