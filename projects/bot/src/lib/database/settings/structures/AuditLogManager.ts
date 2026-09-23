import { hashEnvelope, type AuditEnvelopeInput } from '#lib/database/settings/structures/AuditLogEnvelope';
import type { AuditOutcome, ReadonlyGuildData } from '#lib/database/settings/types';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import { Events } from '#lib/types';
import { channelMention, EmbedBuilder } from '@discordjs/builders';
import { container } from '@sapphire/framework';
import { fetchT, type TFunction } from '@sapphire/plugin-i18next';
import { Colors, chatInputApplicationCommandMention, type User } from 'discord.js';
import { randomUUID } from 'node:crypto';
import type { Models } from 'wolfstar-database';

type TimestampString = Models.public_AuditEvent['timestamp'];
type JsonColumn = Models.public_AuditEvent['changes'];

interface CommandExecutePayload {
	actorId: string;
	commandName: string;
	commandId?: string;
	commandType: 'chat-input' | 'context-menu' | 'message';
	channelId: string;
	timestamp: Date;
}

type AuditLogSettingsAction = 'guild.settings.update' | 'guild.settings.add' | 'guild.settings.remove' | 'guild.settings.access-denied';

type AuditLogAction = AuditLogSettingsAction | 'guild.command.execute';

interface SettingsChangePayload {
	actorId: string;
	action: AuditLogSettingsAction;
	before: Record<string, unknown>;
	after: Record<string, unknown>;
	reason: string | null;
	timestamp: Date;
}

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

		void this.#emitChannelLog(action, { actorId, before: safeBefore, after: safeAfter, reason, timestamp }).catch(() => null);
	}

	async #emitChannelLog(
		action: AuditLogAction,
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

		const channelKey = action === 'guild.command.execute' ? 'logsCommand' : 'logsSettings';
		const channelId = this.#settings[channelKey];
		if (!channelId) return;

		const t = await fetchT(guild);
		const actor = await this.#fetchUser(params.actorId);

		const makeMessage =
			action === 'guild.command.execute'
				? () => {
						const {
							commandName,
							commandId,
							commandType,
							channelId: cmdChannelId
						} = params.after as {
							commandName: string;
							commandId?: string;
							commandType: 'chat-input' | 'context-menu' | 'message';
							channelId: string;
						};
						return this.#buildCommandExecuteEmbed(t, actor, {
							actorId: params.actorId,
							commandName,
							commandId,
							commandType,
							channelId: cmdChannelId,
							timestamp: params.timestamp
						});
					}
				: () =>
						this.#buildSettingsChangeEmbed(t, actor, {
							actorId: params.actorId,
							action: action as AuditLogSettingsAction,
							before: params.before,
							after: params.after,
							reason: params.reason,
							timestamp: params.timestamp
						});

		container.client.emit(Events.GuildMessageLog, guild, channelId, channelKey, makeMessage);
	}

	#buildCommandExecuteEmbed(t: TFunction, actor: User, payload: CommandExecutePayload): EmbedBuilder {
		const { commandName, commandId, commandType, channelId, timestamp } = payload;
		const formattedCommandName = commandType === 'chat-input' ? this.#formatChatInputMention(commandName, commandId) : `\`${commandName}\``;
		const typeLabel =
			commandType === 'chat-input'
				? t(LanguageKeys.Events.Guilds.Logs.CommandTypeChatInput)
				: commandType === 'context-menu'
					? t(LanguageKeys.Events.Guilds.Logs.CommandTypeContextMenu)
					: t(LanguageKeys.Events.Guilds.Logs.CommandTypeMessage);

		const description = [
			`❯ **${t(LanguageKeys.Events.Guilds.Logs.LogFieldType)}:** ${typeLabel}`,
			`❯ **${t(LanguageKeys.Events.Guilds.Logs.LogFieldCommand)}:** ${formattedCommandName}`,
			`❯ **${t(LanguageKeys.Events.Guilds.Logs.LogFieldChannel)}:** ${channelMention(channelId)}`
		].join('\n');

		return new EmbedBuilder()
			.setColor(Colors.Blue)
			.setAuthor(this.#getEmbedAuthor(actor))
			.setDescription(description)
			.setFooter({
				text: t(LanguageKeys.Events.Guilds.Logs.CommandExecuteTitle),
				iconURL: container.client.user!.displayAvatarURL({ size: 128 })
			})
			.setTimestamp(timestamp);
	}

	#buildSettingsChangeEmbed(t: TFunction, actor: User, payload: SettingsChangePayload): EmbedBuilder {
		const { action, before, after, reason, timestamp } = payload;

		const color = action === 'guild.settings.access-denied' ? Colors.Yellow : action === 'guild.settings.remove' ? Colors.Red : Colors.Green;

		const actionTitle =
			action === 'guild.settings.access-denied'
				? t(LanguageKeys.Events.Guilds.Logs.SettingsAccessDeniedTitle)
				: t(LanguageKeys.Events.Guilds.Logs.SettingsUpdateTitle);

		const descLines = [`❯ **${t(LanguageKeys.Events.Guilds.Logs.LogFieldAction)}:** ${actionTitle}`];
		if (reason) descLines.push(`❯ **${t(LanguageKeys.Events.Guilds.Logs.LogFieldReason)}:** ${reason}`);

		const embed = new EmbedBuilder()
			.setColor(color)
			.setAuthor(this.#getEmbedAuthor(actor))
			.setDescription(descLines.join('\n'))
			.setFooter({ text: actionTitle, iconURL: container.client.user!.displayAvatarURL({ size: 128 }) })
			.setTimestamp(timestamp);

		if (action !== 'guild.settings.access-denied') {
			let fields = 0;
			for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
				if (fields === 10) break;

				const hasBefore = key in before;
				const hasAfter = key in after;
				let value: string;
				if (hasBefore && hasAfter) {
					const from = this.#formatAuditValue(before[key]);
					const to = this.#formatAuditValue(after[key]);
					if (from === to) continue;
					value = `has changed ${from} to ${to}`;
				} else {
					value = this.#formatAuditValue(hasAfter ? after[key] : before[key]);
				}

				embed.addFields({ name: key, value: this.#truncateFieldValue(value) });
				fields++;
			}
		}

		return embed;
	}

	async #fetchUser(userId: string): Promise<User> {
		try {
			return await container.client.users.fetch(userId);
		} catch {
			return { id: userId, username: 'Unknown User', discriminator: '0000', avatar: null, bot: false, system: false } as User;
		}
	}

	#formatChatInputMention(commandName: string, commandId?: string): string {
		const parts = commandName.split(' ');
		if (!commandId) return `\`/${commandName}\``;
		if (parts.length === 3) return chatInputApplicationCommandMention(parts[0], parts[1], parts[2], commandId);
		if (parts.length === 2) return chatInputApplicationCommandMention(parts[0], parts[1], commandId);
		return chatInputApplicationCommandMention(parts[0], commandId);
	}

	#formatAuditValue(value: unknown): string {
		if (value === null || value === undefined) return '`null`';
		if (typeof value === 'string') return value.length === 0 ? '""' : value;
		if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
		return '`' + JSON.stringify(value) + '`';
	}

	#getEmbedAuthor(user: User) {
		return { name: user.username, iconURL: typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 128 }) : undefined };
	}

	#truncateFieldValue(value: string): string {
		// Discord rejects embed field values longer than 1024 characters:
		return value.length > 1024 ? `${value.slice(0, 1023)}…` : value;
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
