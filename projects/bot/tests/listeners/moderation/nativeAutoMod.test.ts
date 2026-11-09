import { readSettings } from '#lib/database';
import { guild } from '#mocks/MockInstances';
import { UserListener } from '#root/listeners/moderation/autoModerationActionExecution';
import { getLogger } from '#utils/functions';
import { container } from '@wolfstar/http-framework';
import { AutoModerationActionType, type GatewayAutoModerationActionExecutionDispatchData } from 'discord-api-types/v10';
import { AutoModerationActionExecution } from '@wolfstar/plugin-gateway';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (original) => ({ ...(await original<typeof import('#lib/database')>()), readSettings: vi.fn() }));
vi.mock('#utils/functions', async (original) => ({ ...(await original<typeof import('#utils/functions')>()), getLogger: vi.fn() }));
vi.mock('#lib/moderation/common', async (original) => ({
	...(await original<typeof import('#lib/moderation/common')>()),
	fetchGuildT: vi.fn(
		async () =>
			(key: string, values: Record<string, unknown> = {}) =>
				`${key} ${Object.values(values).join(' ')}`
	)
}));

const send = vi.fn();
const listener = Object.create(UserListener.prototype) as UserListener;
const data: GatewayAutoModerationActionExecutionDispatchData = {
	guild_id: guild.id,
	user_id: '123',
	rule_id: '456',
	channel_id: '789',
	action: { type: AutoModerationActionType.BlockMessage },
	rule_trigger_type: 1,
	content: 'blocked message',
	matched_keyword: null,
	matched_content: null
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(container.gatewayClient.guilds, 'resolve').mockResolvedValue(guild);
	vi.mocked(getLogger).mockResolvedValue({ send } as never);
	vi.mocked(readSettings).mockResolvedValue({
		...getDefaultGuildSettings()!,
		id: guild.id,
		modulesAutomod: true,
		automodTrackNative: true,
		automodChannel: '999'
	} as ReadonlyGuildData);
});

afterEach(() => vi.restoreAllMocks());

test('reports a native action with its user, rule and content in the configured channel', async () => {
	await listener.run(new AutoModerationActionExecution(data));
	expect(send).toHaveBeenCalledTimes(1);
	const options = send.mock.calls[0][0];
	expect(options.channelId).toBe('999');
	const embed = options.makeMessage().toJSON();
	expect(embed.description).toContain('<@123>');
	expect(embed.description).toContain('456');
	expect(embed.fields[0].value).toBe('blocked message');
});

test.each([
	[AutoModerationActionType.BlockMessage, 'nativeAutoModBlocked'],
	[AutoModerationActionType.SendAlertMessage, 'nativeAutoModAlert'],
	[AutoModerationActionType.Timeout, 'nativeAutoModTimeout']
])('identifies action %i in the report', async (type, expected) => {
	await listener.run(
		new AutoModerationActionExecution({ ...data, action: { type } as GatewayAutoModerationActionExecutionDispatchData['action'] })
	);
	expect(send.mock.calls[0][0].makeMessage().toJSON().description).toContain(expected);
});

test.each([{ modulesAutomod: false }, { automodTrackNative: false }, { automodChannel: null }])(
	'does not report when disabled or without a channel: %o',
	async (settings) => {
		vi.mocked(readSettings).mockResolvedValue({
			...getDefaultGuildSettings()!,
			id: guild.id,
			modulesAutomod: true,
			automodTrackNative: true,
			automodChannel: '999',
			...settings
		} as ReadonlyGuildData);
		await listener.run(new AutoModerationActionExecution(data));
		expect(send).not.toHaveBeenCalled();
	}
);
