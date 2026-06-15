import { Prisma } from '#generated/prisma';
import { hashEnvelope, type AuditEnvelopeInput } from '#lib/database/settings/structures/AuditLogEnvelope';
import type { AuditOutcome, ReadonlyGuildData } from '#lib/database/settings/types';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import { Events } from '#lib/types';
import { addAutomaticFields } from '#utils/functions';
import { channelMention, EmbedBuilder, userMention } from '@discordjs/builders';
import { container } from '@sapphire/framework';
import { fetchT, type TFunction } from '@sapphire/plugin-i18next';
import { Colors, chatInputApplicationCommandMention } from 'discord.js';
import { auditDiff } from 'evlog';

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

		const channelKey = action === 'guild.command.execute' ? 'channelsLogsCommand' : 'channelsLogsSettings';
		const channelId = this.#settings[channelKey];
		if (!channelId) return;

		const t = await fetchT(guild);

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
						return this.#buildCommandExecuteEmbed(t, {
							actorId: params.actorId,
							commandName,
							commandId,
							commandType,
							channelId: cmdChannelId,
							timestamp: params.timestamp
						});
					}
				: () =>
						this.#buildSettingsChangeEmbed(t, {
							actorId: params.actorId,
							action: action as AuditLogSettingsAction,
							before: params.before,
							after: params.after,
							reason: params.reason,
							timestamp: params.timestamp
						});

		container.client.emit(Events.GuildMessageLog, guild, channelId, channelKey, makeMessage);
	}

	#buildCommandExecuteEmbed(t: TFunction, payload: CommandExecutePayload): EmbedBuilder {
		const { actorId, commandName, commandId, commandType, channelId, timestamp } = payload;
		const formattedCommandName = commandType === 'chat-input' ? this.#formatChatInputMention(commandName, commandId) : `\`${commandName}\``;
		return new EmbedBuilder()
			.setColor(Colors.Blue)
			.setTitle(t(LanguageKeys.Events.Guilds.Logs.CommandExecuteTitle))
			.addFields(
				{ name: t(LanguageKeys.Events.Guilds.Logs.LogFieldUser), value: userMention(actorId), inline: true },
				{ name: t(LanguageKeys.Events.Guilds.Logs.LogFieldCommand), value: formattedCommandName, inline: true },
				{
					name: t(LanguageKeys.Events.Guilds.Logs.LogFieldType),
					value:
						commandType === 'chat-input'
							? t(LanguageKeys.Events.Guilds.Logs.CommandTypeChatInput)
							: commandType === 'context-menu'
								? t(LanguageKeys.Events.Guilds.Logs.CommandTypeContextMenu)
								: t(LanguageKeys.Events.Guilds.Logs.CommandTypeMessage),
					inline: true
				},
				{ name: t(LanguageKeys.Events.Guilds.Logs.LogFieldChannel), value: channelMention(channelId), inline: true }
			)
			.setTimestamp(timestamp);
	}

	#buildSettingsChangeEmbed(t: TFunction, payload: SettingsChangePayload): EmbedBuilder {
		const { actorId, action, before, after, reason, timestamp } = payload;

		const color = action === 'guild.settings.access-denied' ? Colors.Yellow : action === 'guild.settings.remove' ? Colors.Red : Colors.Green;

		const title =
			action === 'guild.settings.access-denied'
				? t(LanguageKeys.Events.Guilds.Logs.SettingsAccessDeniedTitle)
				: t(LanguageKeys.Events.Guilds.Logs.SettingsUpdateTitle);

		const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp(timestamp);

		if (reason) addAutomaticFields(embed, reason);

		embed.addFields({ name: t(LanguageKeys.Events.Guilds.Logs.LogFieldUser), value: userMention(actorId), inline: true });

		const diff = auditDiff(before, after);

		for (const op of diff.patch.slice(0, 10)) {
			const key = op.path.replace(/^\//, '').replaceAll('/', '.');
			let value: string;
			if (op.op === 'replace') {
				const from = this.#formatAuditValue(this.#getNestedValue(before, op.path));
				const to = this.#formatAuditValue(op.value);
				if (from === to) continue;
				value = `has changed ${from} to ${to}`;
			} else if (op.op === 'add') {
				value = this.#formatAuditValue(op.value);
			} else if (op.op === 'remove') {
				value = this.#formatAuditValue(this.#getNestedValue(before, op.path));
			} else {
				continue;
			}
			addAutomaticFields(embed, key, value);
		}

		return embed;
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

	#getNestedValue(obj: Record<string, unknown>, path: string): unknown {
		const parts = path.split('/').filter(Boolean);
		let current: unknown = obj;
		for (const part of parts) {
			if (current === null || current === undefined || typeof current !== 'object') return undefined;
			current = (current as Record<string, unknown>)[part];
		}
		return current;
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
