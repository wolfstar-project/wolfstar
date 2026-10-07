import { decodeReportId, encodeReportId, type ReportAction } from '#lib/moderation/reports/ids';
import type { ReportSubject } from '#lib/moderation/reports/pending';
import {
	closeReport,
	markReportMessageDeleted,
	renderReport,
	renderReportActionModal,
	renderReportModal,
	type ReportData
} from '#lib/moderation/reports/render';
import { ButtonStyle, ComponentType, MessageFlags, type APIMessageTopLevelComponent } from 'discord-api-types/v10';

const guildId = '254360814063058944';
const targetId = '266624760782258186';
const reporterId = '242043489611808769';
const channelId = '254360814063058945';
const messageId = '254360814063058946';

// Echoes the key and its options, the translations are not what is tested here:
const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;

const messageSubject: ReportSubject = {
	targetId,
	targetTag: '@target',
	message: { channelId, id: messageId, content: 'hello @everyone\nsecond line', attachments: ['https://cdn.discordapp.com/a.png'] }
};
const userSubject: ReportSubject = { targetId, targetTag: '@target', message: null };

function createData(subject: ReportSubject, overrides: Partial<ReportData> = {}): ReportData {
	return { guildId, reporterId, reason: 'spam', subject, createdAt: 1_700_000_000_000, roleId: null, ...overrides };
}

interface AnyComponent {
	type: ComponentType;
	content?: string;
	custom_id?: string;
	disabled?: boolean;
	accent_color?: number;
	components?: AnyComponent[];
}

function flatten(components: readonly unknown[]): AnyComponent[] {
	return (components as AnyComponent[]).flatMap((component) => [component, ...flatten(component.components ?? [])]);
}

function getButtons(components: readonly unknown[]) {
	return flatten(components).filter((component) => component.type === ComponentType.Button);
}

function getText(components: readonly unknown[]) {
	return flatten(components)
		.filter((component) => component.type === ComponentType.TextDisplay)
		.map((component) => component.content)
		.join('\n');
}

describe('reports', () => {
	describe('custom IDs', () => {
		test('GIVEN the action of a message report THEN it survives the round trip the framework parser does', () => {
			const action: ReportAction = { verb: 'timeout', targetId, channelId, messageId, submit: true };
			const id = encodeReportId(action);

			expect(id).toBe(`report.${targetId}.timeout:${channelId}:${messageId}:1`);
			expect(id.length).toBeLessThanOrEqual(100);
			expect(decodeReportId(id.split('.').slice(1))).toEqual(action);
		});

		test('GIVEN the action of a user report THEN it has no message', () => {
			const action: ReportAction = { verb: 'dismiss', targetId, channelId: null, messageId: null, submit: false };

			expect(decodeReportId(encodeReportId(action).split('.').slice(1))).toEqual(action);
		});

		test('GIVEN the longest IDs THEN the custom ID fits in 100 characters', () => {
			const long = '12345678901234567890';
			expect(encodeReportId({ verb: 'timeout', targetId: long, channelId: long, messageId: long, submit: true }).length).toBeLessThanOrEqual(
				100
			);
		});

		test('GIVEN something else THEN it decodes to null', () => {
			expect(decodeReportId(null)).toBeNull();
			expect(decodeReportId([targetId, 'explode:0:0:0'])).toBeNull();
			expect(decodeReportId(['abc', 'warn:0:0:0'])).toBeNull();
			expect(decodeReportId([targetId, `warn:${channelId}:nope:0`])).toBeNull();
			expect(decodeReportId([targetId, 'warn'])).toBeNull();
		});
	});

	describe('renderReport', () => {
		test('GIVEN a message report THEN it has the message, the moderation buttons and the button to delete it', () => {
			const message = renderReport(t, createData(messageSubject));
			const verbs = getButtons(message.components!).map((button) => decodeReportId(button.custom_id!.split('.').slice(1))!.verb);

			expect(message.flags).toBe(MessageFlags.IsComponentsV2);
			expect(verbs).toEqual(['warn', 'timeout', 'kick', 'ban', 'delete', 'dismiss']);
			expect(getText(message.components!)).toContain(`https://discord.com/channels/${guildId}/${channelId}/${messageId}`);
			expect(getText(message.components!)).toContain('commands/report:titleMessage');
		});

		test('GIVEN a user report THEN there is no message to link or to delete', () => {
			const message = renderReport(t, createData(userSubject));
			const verbs = getButtons(message.components!).map((button) => decodeReportId(button.custom_id!.split('.').slice(1))!.verb);

			expect(verbs).toEqual(['warn', 'timeout', 'kick', 'ban', 'dismiss']);
			expect(getText(message.components!)).toContain('commands/report:titleUser');
			expect(getText(message.components!)).not.toContain('commands/report:fieldContent');
		});

		test('GIVEN what the members wrote THEN it is quoted and mentions nobody', () => {
			const message = renderReport(t, createData(messageSubject, { reason: 'first\nsecond' }));

			expect(message.allowed_mentions).toEqual({ parse: [], roles: [] });
			// The echoing translator writes the options as JSON, so a new line is escaped:
			expect(getText(message.components!)).toContain('> first\\n> second');
			expect(getText(message.components!)).toContain('> hello @everyone\\n> second line');
		});

		test('GIVEN a role THEN it is the only mention that notifies', () => {
			const roleId = '254360814063058947';
			const message = renderReport(t, createData(messageSubject, { roleId }));

			expect(message.allowed_mentions).toEqual({ parse: [], roles: [roleId] });
			expect(message.components![0]).toEqual({ type: ComponentType.TextDisplay, content: `<@&${roleId}>` });
		});

		test('GIVEN a long message and a long reason THEN the report fits in a message', () => {
			const subject = { ...messageSubject, message: { ...messageSubject.message!, content: 'x'.repeat(4000) } };
			const message = renderReport(t, createData(subject, { reason: 'y'.repeat(2000) }));

			expect(getText(message.components!).length).toBeLessThan(4000);
		});
	});

	describe('closing', () => {
		const components = renderReport(t, createData(messageSubject)).components as APIMessageTopLevelComponent[];

		test('GIVEN a report that is closed THEN its buttons are gone and the status is under it', () => {
			const closed = closeReport(components, 'status line');

			expect(getButtons(closed)).toEqual([]);
			expect(getText(closed)).toContain('commands/report:titleMessage');
			expect(getText(closed).endsWith('status line')).toBe(true);
			expect(flatten(closed).find((component) => component.type === ComponentType.Container)!.accent_color).not.toBe(
				flatten(components).find((component) => component.type === ComponentType.Container)!.accent_color
			);
		});

		test('GIVEN a report whose message was deleted THEN it stays open, without the button to delete it again', () => {
			const marked = markReportMessageDeleted(components, 'deleted note');
			const buttons = getButtons(marked);

			expect(buttons).toHaveLength(6);
			expect(buttons.filter((button) => button.disabled).map((button) => button.custom_id)).toEqual([
				encodeReportId({ verb: 'delete', targetId, channelId, messageId, submit: false })
			]);
			expect(getText(marked)).toContain('deleted note');
		});
	});

	describe('modals', () => {
		test('GIVEN a report THEN its modal asks for a reason and carries what is reported', () => {
			const modal = renderReportModal(t, messageSubject);
			const [input] = flatten(modal.components).filter((component) => component.type === ComponentType.TextInput);

			expect(decodeReportId(modal.custom_id.split('.').slice(1))).toEqual({ verb: 'new', targetId, channelId, messageId, submit: true });
			expect(input).toMatchObject({ custom_id: 'reason', required: true });
			expect(modal.title.length).toBeLessThanOrEqual(45);
		});

		test('GIVEN a moderation action THEN only the timeout asks for a duration', () => {
			const action = { targetId, channelId, messageId, submit: false } as const;
			const inputs = (verb: 'warn' | 'timeout' | 'kick' | 'ban') =>
				flatten(renderReportActionModal(t, { ...action, verb }).components)
					.filter((component) => component.type === ComponentType.TextInput)
					.map((component) => component.custom_id);

			expect(inputs('warn')).toEqual(['reason']);
			expect(inputs('kick')).toEqual(['reason']);
			expect(inputs('ban')).toEqual(['reason']);
			expect(inputs('timeout')).toEqual(['duration', 'reason']);
			expect(
				decodeReportId(
					renderReportActionModal(t, { ...action, verb: 'ban' })
						.custom_id.split('.')
						.slice(1)
				)
			).toMatchObject({
				verb: 'ban',
				submit: true
			});
		});
	});
});

// The buttons of a report are the styles the moderators learn to read at a glance:
test('report button styles', () => {
	const buttons = getButtons(renderReport(t, createData(userSubject)).components!) as unknown as { style: ButtonStyle }[];
	expect(buttons.map((button) => button.style)).toEqual([
		ButtonStyle.Secondary,
		ButtonStyle.Primary,
		ButtonStyle.Danger,
		ButtonStyle.Danger,
		ButtonStyle.Secondary
	]);
});
