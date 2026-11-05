import { importSettings } from '#lib/structures/settings-menu/transfer';
import * as database from '#lib/database/settings';
import { getDefaultGuildSettings } from '#lib/database/settings/constants';
import { SerializerStore } from '#lib/database/settings/structures/SerializerStore';
import { UserSerializer } from '../../../src/serializers/string';
import { container } from '@sapphire/framework';
import type { TFunction } from '@sapphire/plugin-i18next';
import type { ButtonInteraction, Guild } from 'discord.js';

const t = ((key: string) => key) as TFunction;

beforeEach(() => {
	const store = new SerializerStore();
	container.stores.register(store);
	store.set('string', new UserSerializer({ name: 'string', root: process.cwd(), path: 'string.ts', store }, { name: 'string' }));
});
afterEach(() => vi.restoreAllMocks());

function fixture(action: 'confirm' | 'cancel', permission = true, stale = false) {
	const settings = { ...getDefaultGuildSettings(), id: '123', prefix: '!' } as database.ReadonlyGuildData;
	const submitWithAudit = vi.fn();
	const trx = {
		settings: stale ? { ...settings, prefix: 'changed' } : settings,
		write: vi.fn().mockReturnValue({ submitWithAudit }),
		[Symbol.dispose]: vi.fn()
	};
	vi.spyOn(database, 'readSettings').mockReturnValue(settings);
	const transaction = vi.spyOn(database, 'writeSettingsTransaction').mockResolvedValue(trx as unknown as database.Transaction);
	const guild = { members: { fetch: vi.fn().mockResolvedValue({ permissions: { has: () => permission } }) } } as unknown as Guild;
	let buttonId: string;
	const confirmation = {
		user: { id: '456' },
		get customId() {
			return buttonId;
		},
		deferUpdate: vi.fn()
	};
	const preview = {
		awaitMessageComponent: vi.fn(async (options) => {
			expect(trx.write).not.toHaveBeenCalled();
			expect(options.filter({ ...confirmation, user: { id: 'other' } })).toBe(false);
			return confirmation;
		})
	};
	const submission = {
		deferReply: vi.fn(),
		fields: { getUploadedFiles: () => null, getTextInputValue: () => JSON.stringify({ version: 1, settings: { prefix: '?' } }) },
		editReply: vi.fn(async (payload) => {
			if (payload.components?.length) buttonId = payload.components[0].components[action === 'confirm' ? 0 : 1].data.custom_id;
			return preview;
		})
	};
	const interaction = {
		user: { id: '456' },
		guild,
		showModal: vi.fn((modal) => modal.toJSON()),
		awaitModalSubmit: vi.fn().mockResolvedValue(submission)
	} as unknown as ButtonInteraction;
	return { interaction, submission, trx, transaction, submitWithAudit };
}

it('writes the reviewed changes only after confirmation and records the actor', async () => {
	const f = fixture('confirm');
	await importSettings(f.interaction, t);
	expect(f.trx.write).toHaveBeenCalledWith({ prefix: '?' });
	expect(f.submitWithAudit).toHaveBeenCalledWith('456');
	expect(f.submission.editReply).toHaveBeenLastCalledWith({ content: 'commands/conf:transferApplied', components: [], attachments: [] });
});

it('cancelling an import leaves settings untouched', async () => {
	const f = fixture('cancel');
	await importSettings(f.interaction, t);
	expect(f.transaction).not.toHaveBeenCalled();
	expect(f.submission.editReply).toHaveBeenLastCalledWith({ content: 'commands/conf:transferCancelled', components: [], attachments: [] });
});

it('rejects an import when the user no longer has Manage Server', async () => {
	const f = fixture('confirm', false);
	await importSettings(f.interaction, t);
	expect(f.transaction).not.toHaveBeenCalled();
	expect(f.submission.editReply).toHaveBeenLastCalledWith('commands/conf:transferPermission');
});

it('does not overwrite changes made after the preview', async () => {
	const f = fixture('confirm', true, true);
	await importSettings(f.interaction, t);
	expect(f.trx.write).not.toHaveBeenCalled();
	expect(f.submission.editReply).toHaveBeenLastCalledWith({ content: 'commands/conf:transferStale', components: [], attachments: [] });
});
