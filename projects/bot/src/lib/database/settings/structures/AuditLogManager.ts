import { hashEnvelope, type AuditEnvelopeInput } from '#lib/database/settings/structures/AuditLogEnvelope';
import { container } from '@wolfstar/http-framework';
import { randomUUID } from 'node:crypto';
import type { AuditOutcome, Models, ReadonlyGuildData } from 'wolfstar-database';

type TimestampString = Models.public_AuditEvent['timestamp'];
type JsonColumn = Models.public_AuditEvent['changes'];

type AuditLogSettingsAction = 'guild.settings.update' | 'guild.settings.add' | 'guild.settings.remove' | 'guild.settings.access-denied';

type AuditLogAction = AuditLogSettingsAction | 'guild.command.execute';

/**
 * Writes what is done to the settings of a guild, and the commands that are run in it, as rows of `AuditEvent`.
 *
 * @remarks The rows are read on the web (`guilds/:guild/audit-logs` and `guilds/:guild/command-logs`). They are not
 * sent to a channel of the guild: there is no setting for one.
 */
export class AuditLogManager {
	#guildId: string;

	public constructor(settings: ReadonlyGuildData) {
		this.#guildId = settings.id;
	}

	public onPatch(settings: ReadonlyGuildData): void {
		this.#guildId = settings.id;
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
		action: AuditLogAction;
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

		await container.prisma.transaction(async (tx) => {
			// Acquire a global transaction-level advisory lock.
			// The singleton chain head is shared across all tenants, so all writers
			// must be globally serialised. Released automatically on commit/rollback.
			// Namespace 0x4155444C = ASCII 'AUDL' = 1096107084.
			await tx.execute(container.prisma.raw.sql`SELECT pg_advisory_xact_lock(1096107084)`.affectedCount().build());

			const head = await tx.orm.public.AuditChainHead.first({ id: 'default' });
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
			const storedTimestamp = timestamp.toISOString() as TimestampString;

			await tx.orm.public.AuditEvent.create({
				id: randomUUID(),
				action,
				actorType: 'user',
				actorId: BigInt(actorId),
				actorName: null,
				targetType: null,
				targetId: null,
				outcome,
				tenantId: BigInt(tenantId),
				reason,
				timestamp: storedTimestamp,
				// `#toJsonSafe` already turned every value into its JSON form:
				changes: changes as JsonColumn,
				context: null,
				prevHash,
				hash
			});

			await tx.orm.public.AuditChainHead.upsert({
				create: { id: 'default', hash, updatedAt: storedTimestamp },
				update: { hash, updatedAt: storedTimestamp }
			});
		});
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
