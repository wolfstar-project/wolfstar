import { compressCustomIdMetadata, decompressCustomIdMetadata } from '#utils/customIdMetadata';
import { buildSettingsMenuCustomId, parseSettingsMenuCustomId, SettingsMenuAction, SettingsMenuUpdateType } from '#utils/settingsMenuCustomId';

describe('customIdMetadata', () => {
	it('round-trips arbitrary metadata', () => {
		const payload = { foo: 'bar', count: 42, nested: { enabled: true } };
		const compressed = compressCustomIdMetadata(payload);

		expect(decompressCustomIdMetadata<typeof payload>(compressed)).toEqual(payload);
	});

	it('keeps realistic settings menu payloads under the Discord custom_id limit', () => {
		const metadata = {
			u: '123456789012345678',
			a: SettingsMenuAction.Set,
			p: 'moderation.logging.channel',
			im: 1 as const,
			it: SettingsMenuUpdateType.Set
		};

		const customId = buildSettingsMenuCustomId(SettingsMenuAction.Set, {
			u: metadata.u,
			p: metadata.p,
			im: metadata.im,
			it: metadata.it
		});

		expect(customId.length).toBeLessThanOrEqual(100);
		expect(parseSettingsMenuCustomId(customId)?.data).toEqual(metadata);
	});
});

describe('settingsMenuCustomId', () => {
	it('returns null for unknown prefixes', () => {
		expect(parseSettingsMenuCustomId('unknown-prefix|payload')).toBeNull();
	});

	it('returns null for malformed custom ids', () => {
		expect(parseSettingsMenuCustomId('conf-set')).toBeNull();
	});

	it('builds and parses every action prefix', () => {
		const context = {
			u: '987654321098765432',
			p: 'prefix',
			im: 0 as const
		};

		for (const action of [
			SettingsMenuAction.Select,
			SettingsMenuAction.Back,
			SettingsMenuAction.Stop,
			SettingsMenuAction.Set,
			SettingsMenuAction.Remove,
			SettingsMenuAction.Reset,
			SettingsMenuAction.Undo,
			SettingsMenuAction.Cancel,
			SettingsMenuAction.InputBoolTrue,
			SettingsMenuAction.InputBoolFalse,
			SettingsMenuAction.InputRole,
			SettingsMenuAction.InputChannel,
			SettingsMenuAction.InputRemove,
			SettingsMenuAction.InputCategory,
			SettingsMenuAction.InputCommand,
			SettingsMenuAction.InputCommandBack,
			SettingsMenuAction.InputModal,
			SettingsMenuAction.InputModalField
		]) {
			const customId = buildSettingsMenuCustomId(action, context);
			const parsed = parseSettingsMenuCustomId(customId);

			expect(parsed).not.toBeNull();
			expect(parsed!.action).toBe(action);
			expect(parsed!.data).toEqual({ ...context, a: action });
		}
	});
});
