import { readSettings } from '#lib/database';
import { ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { commands, createUser, guild, textChannel } from '#mocks/MockInstances';
import { container } from '@wolfstar/http-framework';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import { Locale } from 'discord-api-types/v10';

vi.mock('#lib/database', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database')>()),
	readSettings: vi.fn()
}));

class WarnCommand extends ModerationCommand<TypeVariation.Warning, null> {}

// `resolveParameters` is protected, it is the first step of the action:
const prototype = WarnCommand.prototype as unknown as { resolveParameters: () => never };

const root = '/virtual/commands';
const command = new WarnCommand({ name: 'warn', path: `${root}/Moderation/warn.ts`, root, store: commands }, {
	type: TypeVariation.Warning
} as never);

const moderator = createUser();
const target = createUser({ id: '266624760782258187', username: 'Target' });

// What `execute` reads of the interaction, which is the one of the command or the click that answered its prompt:
const interaction = {
	guildId: guild.id,
	guild_id: guild.id,
	locale: Locale.EnglishUS,
	guild_locale: Locale.EnglishUS,
	user: { id: moderator.id },
	channel: { id: textChannel.id }
};

function mockModules(modulesModeration: boolean) {
	vi.mocked(readSettings).mockResolvedValue({ modulesModeration } as never);
}

describe('moderation module', () => {
	beforeAll(() => container.i18n.init());

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	// The prompts of a recent case and of the role of an action run the command again with `execute`, without the
	// `commandsEnabled` precondition, so the module is asked for there too:
	test('GIVEN the moderation module turned off WHEN a command runs THEN it is refused before the action', async () => {
		mockModules(false);
		const resolveParameters = vi.spyOn(prototype, 'resolveParameters');

		const answer = await command.execute(interaction as never, { user: target } as never);

		expect(resolveParameters).not.toHaveBeenCalled();
		const t = container.i18n.getT('en-US') as TFunction<AnyNamespace>;
		expect(JSON.stringify(answer)).toContain(t('preconditions:disabledModuleModeration'));
	});

	test('GIVEN the moderation module turned on WHEN a command runs THEN it goes on to the action', async () => {
		mockModules(true);
		const resolveParameters = vi.spyOn(prototype, 'resolveParameters').mockImplementation(() => {
			throw new Error('reached the action');
		});

		const answer = await command.execute(interaction as never, { user: target } as never);

		expect(resolveParameters).toHaveBeenCalledOnce();
		expect(JSON.stringify(answer)).toContain('reached the action');
	});
});
