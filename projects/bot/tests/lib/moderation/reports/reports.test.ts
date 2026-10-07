import { decodeReportId, encodeReportId, type ReportAction } from '#lib/moderation/reports/ids';
import type { ReportSubject } from '#lib/moderation/reports/pending';
import { addReportNote, closeReport, renderReport, renderReportActionModal, renderReportModal } from '#lib/moderation/reports/render';
import { ButtonStyle, ComponentType, MessageFlags, type APIMessageTopLevelComponent } from 'discord-api-types/v10';
import type { Report } from 'wolfstar-database';

const guildId = '254360814063058944';
const targetId = '266624760782258186';
const reporterId = '242043489611808769';
const channelId = '254360814063058945';
const messageId = '254360814063058946';
const reportId = '42';

// Echoes the key and its options, the translations are not what is tested here:
const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;

const messageSubject: ReportSubject = {
	targetId,
	targetTag: '@target',
	message: { channelId, id: messageId, content: 'hello', attachments: [] }
};

function createReport(overrides: Partial<Report> = {}): Report {
	return {
		id: reportId,
		guildId,
		reporterId,
		targetId,
		targetTag: '@target',
		channelId,
		messageId,
		reason: 'spam',
		content: 'hello @everyone\nsecond line',
		attachments: ['https://cdn.discordapp.com/a.png'],
		anonymous: false,
		status: 'Open',
		action: null,
		caseId: null,
		moderatorId: null,
		createdAt: 1_700_000_000_000,
		closedAt: null,
		...overrides
	};
}

const userReport = { channelId: null, messageId: null, content: null, attachments: [] } satisfies Partial<Report>;

interface AnyComponent {
	type: ComponentType;
	content?: string;
	custom_id?: string;
	disabled?: boolean;
	options?: { value: string }[];
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
	const getVerbs = (components: readonly unknown[]) =>
		getButtons(components).map((button) => decodeReportId(button.custom_id!.split('.').slice(1))!.verb);
	const getMenu = (components: readonly unknown[]) => flatten(components).find((component) => component.type === ComponentType.StringSelect);

	describe('custom IDs', () => {
		test('GIVEN the action of a report THEN it survives the round trip the framework parser does', () => {
			const action: ReportAction = { verb: 'timeout', id: reportId, messageId: null, submit: true };
			const id = encodeReportId(action);

			expect(id).toBe(`report.${reportId}.timeout:0:1`);
			expect(decodeReportId(id.split('.').slice(1))).toEqual(action);
		});

		test('GIVEN the modal of a new report THEN it carries who and what is reported', () => {
			const action: ReportAction = { verb: 'new', id: targetId, messageId, submit: true };

			expect(decodeReportId(encodeReportId(action).split('.').slice(1))).toEqual(action);
		});

		test('GIVEN the longest IDs THEN the custom ID fits in 100 characters', () => {
			const long = '12345678901234567890';
			expect(encodeReportId({ verb: 'softban', id: long, messageId: long, submit: true }).length).toBeLessThanOrEqual(100);
		});

		test('GIVEN something else THEN it decodes to null', () => {
			expect(decodeReportId(null)).toBeNull();
			expect(decodeReportId([reportId, 'explode:0:0'])).toBeNull();
			expect(decodeReportId(['abc', 'warn:0:0'])).toBeNull();
			expect(decodeReportId([reportId, 'warn:nope:0'])).toBeNull();
			expect(decodeReportId([reportId, 'warn'])).toBeNull();
		});
	});

	describe('renderReport', () => {
		test('GIVEN a message report THEN it has the message, three action buttons, the menu, and the button to delete it', () => {
			const message = renderReport(t, createReport(), null);

			expect(message.flags).toBe(MessageFlags.IsComponentsV2);
			expect(getVerbs(message.components!)).toEqual(['warn', 'timeout', 'kick', 'delete', 'dismiss']);
			expect(getText(message.components!)).toContain(`https://discord.com/channels/${guildId}/${channelId}/${messageId}`);
			expect(getText(message.components!)).toContain('commands/report:titleMessage');
			expect(getText(message.components!)).toContain(`commands/report:footer {"id":"${reportId}"}`);
		});

		test('GIVEN the menu THEN it offers the heavier actions and blocking the reporter, not a ban button', () => {
			const menu = getMenu(renderReport(t, createReport(), null).components!)!;

			expect(decodeReportId(menu.custom_id!.split('.').slice(1))).toEqual({ verb: 'menu', id: reportId, messageId: null, submit: false });
			expect(menu.options!.map((option) => option.value)).toEqual(['mute', 'softban', 'ban', 'block']);
		});

		test('GIVEN a user report THEN there is no message to link or to delete', () => {
			const message = renderReport(t, createReport(userReport), null);

			expect(getVerbs(message.components!)).toEqual(['warn', 'timeout', 'kick', 'dismiss']);
			expect(getText(message.components!)).toContain('commands/report:titleUser');
			expect(getText(message.components!)).not.toContain('commands/report:fieldContent');
		});

		test('GIVEN an anonymous report THEN who made it is not in the message', () => {
			const message = renderReport(t, createReport({ anonymous: true }), null);

			expect(getText(message.components!)).toContain('commands/report:fieldReportedByAnonymous');
			expect(JSON.stringify(message)).not.toContain(reporterId);
		});

		test('GIVEN what the members wrote THEN it is quoted and mentions nobody', () => {
			const message = renderReport(t, createReport({ reason: 'first\nsecond' }), null);

			expect(message.allowed_mentions).toEqual({ parse: [], roles: [] });
			// The echoing translator writes the options as JSON, so a new line is escaped:
			expect(getText(message.components!)).toContain('> first\\n> second');
			expect(getText(message.components!)).toContain('> hello @everyone\\n> second line');
		});

		test('GIVEN a role THEN it is the only mention that notifies', () => {
			const roleId = '254360814063058947';
			const message = renderReport(t, createReport(), roleId);

			expect(message.allowed_mentions).toEqual({ parse: [], roles: [roleId] });
			expect(message.components![0]).toEqual({ type: ComponentType.TextDisplay, content: `<@&${roleId}>` });
		});

		test('GIVEN a long message and a long reason THEN the report fits in a message', () => {
			const message = renderReport(t, createReport({ content: 'x'.repeat(4000), reason: 'y'.repeat(2000) }), null);

			expect(getText(message.components!).length).toBeLessThan(4000);
		});

		test('GIVEN the buttons THEN they have the styles the moderators read at a glance', () => {
			const buttons = getButtons(renderReport(t, createReport(userReport), null).components!) as unknown as { style: ButtonStyle }[];

			expect(buttons.map((button) => button.style)).toEqual([
				ButtonStyle.Secondary,
				ButtonStyle.Primary,
				ButtonStyle.Danger,
				ButtonStyle.Secondary
			]);
		});
	});

	describe('closing', () => {
		const components = renderReport(t, createReport(), null).components as APIMessageTopLevelComponent[];

		test('GIVEN a report that is closed THEN its buttons and its menu are gone and the status is under it', () => {
			const closed = closeReport(components, 'status line');

			expect(getButtons(closed)).toEqual([]);
			expect(getMenu(closed)).toBeUndefined();
			expect(getText(closed)).toContain('commands/report:titleMessage');
			expect(getText(closed).endsWith('status line')).toBe(true);
			expect(flatten(closed).find((component) => component.type === ComponentType.Container)!.accent_color).not.toBe(
				flatten(components).find((component) => component.type === ComponentType.Container)!.accent_color
			);
		});

		test('GIVEN a report whose message was deleted THEN it stays open, without the button to delete it again', () => {
			const marked = addReportNote(components, 'deleted note', 'delete');
			const buttons = getButtons(marked);

			expect(buttons).toHaveLength(5);
			expect(buttons.filter((button) => button.disabled).map((button) => button.custom_id)).toEqual([
				encodeReportId({ verb: 'delete', id: reportId, messageId: null, submit: false })
			]);
			expect(getMenu(marked)).toBeDefined();
			expect(getText(marked)).toContain('deleted note');
		});

		test('GIVEN a note that disables nothing THEN every component stays usable', () => {
			const marked = addReportNote(components, 'blocked note');

			expect(getButtons(marked).some((button) => button.disabled)).toBe(false);
			expect(getText(marked)).toContain('blocked note');
		});
	});

	describe('modals', () => {
		test('GIVEN a report THEN its modal asks for a reason and carries what is reported', () => {
			const modal = renderReportModal(t, messageSubject);
			const [input] = flatten(modal.components).filter((component) => component.type === ComponentType.TextInput);

			expect(decodeReportId(modal.custom_id.split('.').slice(1))).toEqual({ verb: 'new', id: targetId, messageId, submit: true });
			expect(input).toMatchObject({ custom_id: 'reason', required: true });
			expect(modal.title.length).toBeLessThanOrEqual(45);
		});

		test('GIVEN a moderation action THEN only the ones that can last ask for a duration', () => {
			const inputs = (verb: Parameters<typeof renderReportActionModal>[2]) =>
				flatten(renderReportActionModal(t, reportId, verb).components)
					.filter((component) => component.type === ComponentType.TextInput)
					.map((component) => [component.custom_id, (component as { required?: boolean }).required]);

			expect(inputs('warn')).toEqual([['reason', false]]);
			expect(inputs('kick')).toEqual([['reason', false]]);
			expect(inputs('softban')).toEqual([['reason', false]]);
			expect(inputs('timeout')).toEqual([
				['duration', true],
				['reason', false]
			]);
			expect(inputs('mute')).toEqual([
				['duration', false],
				['reason', false]
			]);
			expect(inputs('ban')).toEqual([
				['duration', false],
				['reason', false]
			]);
			expect(decodeReportId(renderReportActionModal(t, reportId, 'ban').custom_id.split('.').slice(1))).toEqual({
				verb: 'ban',
				id: reportId,
				messageId: null,
				submit: true
			});
		});
	});
});
