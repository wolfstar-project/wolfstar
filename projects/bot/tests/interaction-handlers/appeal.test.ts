import { settleAppeal } from '#lib/moderation/appealService';
import { UserInteractionHandler } from '#root/interaction-handlers/appeal';
import { ModalSubmitInteraction } from '@wolfstar/http-framework';
import { container } from '@wolfstar/http-framework';
import { MessageFlags } from 'discord-api-types/v10';
import { fetchAppeal } from 'wolfstar-database';

vi.mock('#lib/moderation/appealService', () => ({
	AppealSettleErrorKeys: { caseGone: 'case-gone', decided: 'already-decided', undoFailed: 'undo-failed' },
	settleAppeal: vi.fn()
}));
vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	fetchAppeal: vi.fn()
}));
vi.mock('@wolfstar/plugin-i18next', async (importOriginal) => ({
	...(await importOriginal<typeof import('@wolfstar/plugin-i18next')>()),
	getSupportedUserLanguageT: vi.fn(() => (key: string) => key)
}));

const guildId = '254360814063058944';

describe('the modal of a decision', () => {
	const update = vi.fn();
	const deferUpdate = vi.fn(async () => ({ update }));
	const followup = vi.fn();

	function run() {
		const interaction = Object.create(ModalSubmitInteraction.prototype) as ModalSubmitInteraction;
		Object.defineProperties(interaction, {
			guildId: { value: guildId },
			user: { value: { id: '1' } },
			data: { value: { components: [] } },
			deferUpdate: { value: deferUpdate },
			followup: { value: followup },
			reply: { value: vi.fn() }
		});
		return UserInteractionHandler.prototype.run.call({ container } as never, interaction as never, ['12', 'deny:1']);
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(fetchAppeal).mockResolvedValue({ id: '12' } as never);
		vi.mocked(settleAppeal).mockResolvedValue({ message: { embeds: [], components: [] } });
		Object.assign(container, { prisma: {}, gatewayClient: { guilds: { fetch: vi.fn(async () => ({ id: guildId })) } } });
	});

	test('GIVEN a decision THEN the answer is deferred first: an undo can take longer than Discord waits', async () => {
		await run();

		expect(deferUpdate.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(settleAppeal).mock.invocationCallOrder[0]);
		expect(update).toHaveBeenCalledWith(expect.objectContaining({ components: [] }));
	});

	test('GIVEN an appeal that could not be decided THEN only the moderator is told', async () => {
		vi.mocked(settleAppeal).mockResolvedValue({ error: 'decided' });

		await run();

		expect(followup).toHaveBeenCalledWith({ content: 'already-decided', flags: MessageFlags.Ephemeral });
		expect(update).not.toHaveBeenCalled();
	});
});
