import type { AuditLogChange, ReadonlyGuildData } from '#lib/database/settings/types';
import { container } from '@sapphire/framework';

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

	public update(userId: string, newData: Record<string, unknown>): Promise<void> {
		const changedKeys = Object.keys(newData);
		const changes = this.#buildChanges(newData);

		return this.write(userId, {
			action: 'settings.update',
			section: AuditLogManager.deriveSection(changedKeys),
			changes
		});
	}

	public add(userId: string, key: string, value: unknown): Promise<void> {
		return this.write(userId, {
			action: 'settings.add',
			section: AuditLogManager.deriveSection([key]),
			changes: [{ key, newValue: AuditLogManager.serializeValue(value) }]
		});
	}

	public remove(userId: string, key: string, value: unknown): Promise<void> {
		return this.write(userId, {
			action: 'settings.remove',
			section: AuditLogManager.deriveSection([key]),
			changes: [{ key, oldValue: AuditLogManager.serializeValue(value) }]
		});
	}

	public async write(userId: string, params: { action: string; section: string; changes: AuditLogChange[] }): Promise<void> {
		await container.prisma.auditLog.create({
			data: {
				guildId: this.#guildId,
				userId,
				action: params.action,
				section: params.section,
				changes: JSON.parse(JSON.stringify(params.changes))
			}
		});
	}

	#buildChanges(newData: Record<string, unknown>): AuditLogChange[] {
		return Object.keys(newData).map((key) => ({
			key,
			oldValue: AuditLogManager.serializeValue((this.#settings as Record<string, unknown>)[key]),
			newValue: AuditLogManager.serializeValue(newData[key])
		}));
	}

	private static deriveSection(keys: string[]): string {
		const counts = new Map<string, number>();
		for (const key of keys) {
			const section = AuditLogManager.classifyKey(key);
			counts.set(section, (counts.get(section) ?? 0) + 1);
		}

		if (counts.size === 0) return 'general';
		if (counts.size === 1) return counts.keys().next().value!;

		let best = 'general';
		let max = 0;
		for (const [section, count] of counts) {
			if (count > max) {
				max = count;
				best = section;
			}
		}
		return best;
	}

	private static classifyKey(key: string): string {
		if (key.startsWith('permissions')) return 'permissions';
		if (key.startsWith('selfmod') || key.startsWith('noMentionSpam')) return 'moderation';
		if (key.startsWith('channels')) return 'channels';
		if (key.startsWith('roles')) return 'roles';
		if (key.startsWith('events')) return 'events';
		if (key.startsWith('messages')) return 'messages';
		if (key.startsWith('disabled')) return 'commands';
		return 'general';
	}

	private static serializeValue(value: unknown): unknown {
		if (typeof value === 'bigint') return Number(value);
		return value;
	}
}
