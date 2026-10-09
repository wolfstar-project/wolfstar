import type { Translator } from '#lib/structures/commands/utils';
import { encodeReportId, getReportMenuVerbs, type ReportModerationVerb, type ReportVerb } from '#lib/moderation/reports/ids';
import type { ReportSubject } from '#lib/moderation/reports/pending';
import { channelMention, hyperlink, messageLink, roleMention, time, TimestampStyles, userMention } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import {
	ButtonStyle,
	ComponentType,
	MessageFlags,
	SeparatorSpacingSize,
	TextInputStyle,
	type APIActionRowComponent,
	type APIButtonComponentWithCustomId,
	type APIStringSelectComponent,
	type APIComponentInContainer,
	type APIMessageTopLevelComponent,
	type APIModalInteractionResponseCallbackData,
	type RESTPostAPIChannelMessageJSONBody,
	type Snowflake
} from 'discord-api-types/v10';
import type { Report } from 'wolfstar-database';

const AccentColor = 0xed4245;
const ClosedAccentColor = 0x4f545c;

/**
 * The longest reason a report or a moderation action taken from one has.
 */
export const ReportReasonMaximumLength = 500;

/**
 * How much of a reported message a report keeps and quotes.
 */
export const ReportContentMaximumLength = 1000;

/**
 * The custom IDs of the inputs of the modals of the reports.
 */
export const ReportReasonInputId = 'reason';
export const ReportDurationInputId = 'duration';

/**
 * Renders the report the moderators get: what was reported, by whom and why, with the components to act on it.
 *
 * @remarks The report is a container of blocks a separator apart: the title with the report and when it was made, who
 * is reported, who reported, why, and, for a message, what it said. The three actions the moderators take the most have
 * a button, as the report of a message reads best with few of them; the heavier ones, and blocking who made the report
 * (or letting them report again), are in the menu under them.
 *
 * @param t - The function to translate with, in the language of the guild.
 * @param report - The report.
 * @param roleId - The role to mention with the report, if any.
 * @param reporterBlocked - Whether the member who made the report is blocked from reporting.
 */
export function renderReport(
	t: Translator,
	report: Report,
	roleId: Snowflake | null,
	reporterBlocked = false
): Pick<RESTPostAPIChannelMessageJSONBody, 'components' | 'flags' | 'allowed_mentions'> {
	const hasMessage = report.channelId !== null && report.messageId !== null;
	const id = (verb: ReportVerb) => encodeReportId({ verb, id: report.id, messageId: null, submit: false });
	const block = (...lines: string[]): APIComponentInContainer[] => [
		{ type: ComponentType.Separator, divider: true, spacing: SeparatorSpacingSize.Small },
		{ type: ComponentType.TextDisplay, content: lines.join('\n') }
	];

	const target = { mention: userMention(report.targetId), tag: report.targetTag, id: report.targetId };
	const header = [
		`## ${t(hasMessage ? 'commands/report:titleMessage' : 'commands/report:titleUser')}`,
		`-# ${t('commands/report:footer', { id: report.id, time: time(Math.floor(report.createdAt / 1000), TimestampStyles.LongDateTime) })}`
	];

	const content: APIComponentInContainer[] = [{ type: ComponentType.TextDisplay, content: header.join('\n') }];
	if (hasMessage) {
		const link = hyperlink(t('commands/report:fieldMessageLink'), messageLink(report.channelId!, report.messageId!, report.guildId));
		content.push(
			...block(t('commands/report:fieldAuthor', target)),
			...block(t('commands/report:fieldMessage', { link, channel: channelMention(report.channelId!) }))
		);
	} else {
		content.push(...block(t('commands/report:fieldUser', target)));
	}

	content.push(
		// The moderators are not told who made an anonymous report, the database is:
		...block(
			report.anonymous
				? t('commands/report:fieldReportedByAnonymous')
				: t('commands/report:fieldReportedBy', { mention: userMention(report.reporterId) })
		),
		...block(t('commands/report:fieldReason', { reason: quote(cutText(report.reason, ReportReasonMaximumLength)) }))
	);

	if (hasMessage) {
		const text = (report.content ?? '').trim();
		content.push(
			...block(
				t('commands/report:fieldContent', {
					content: text.length === 0 ? t('commands/report:fieldContentEmpty') : quote(cutText(text, ReportContentMaximumLength))
				}),
				t('commands/report:fieldMedia', {
					media:
						report.attachments.length === 0
							? t('commands/report:mediaNone')
							: report.attachments.map((url, index) => hyperlink(String(index + 1), url)).join(' · ')
				})
			)
		);
	}

	const components: APIMessageTopLevelComponent[] = [];
	// The mention is outside of the container, so the report reads the same once it is closed:
	if (roleId !== null) components.push({ type: ComponentType.TextDisplay, content: roleMention(roleId) });
	components.push({
		type: ComponentType.Container,
		accent_color: AccentColor,
		components: [
			...content,
			{ type: ComponentType.Separator, divider: true, spacing: SeparatorSpacingSize.Large },
			row([
				button(id('warn'), t('commands/report:buttonWarn'), ButtonStyle.Secondary),
				button(id('timeout'), t('commands/report:buttonTimeout'), ButtonStyle.Primary),
				button(id('kick'), t('commands/report:buttonKick'), ButtonStyle.Danger)
			]),
			{ type: ComponentType.ActionRow, components: [renderReportMenu(t, report.id, reporterBlocked)] },
			row([
				...(hasMessage ? [button(id('delete'), t('commands/report:buttonDelete'), ButtonStyle.Secondary)] : []),
				button(id('dismiss'), t('commands/report:buttonDismiss'), ButtonStyle.Secondary)
			])
		]
	});

	return {
		components,
		flags: MessageFlags.IsComponentsV2,
		// Only the role is notified: the users are mentioned to be clickable, and what was quoted mentions nobody.
		allowed_mentions: { parse: [], roles: roleId === null ? [] : [roleId] }
	};
}

/**
 * Renders the menu of the other actions of a report.
 *
 * @param t - The function to translate with, in the language of the guild.
 * @param reportId - The ID of the report.
 * @param reporterBlocked - Whether the member who made the report is blocked from reporting, which makes the menu offer
 * to let them report again and not to block them.
 */
export function renderReportMenu(t: Translator, reportId: string, reporterBlocked: boolean): APIStringSelectComponent {
	return {
		type: ComponentType.StringSelect,
		custom_id: encodeReportId({ verb: 'menu', id: reportId, messageId: null, submit: false }),
		placeholder: cutText(t('commands/report:menuPlaceholder'), 150),
		options: getReportMenuVerbs(reporterBlocked).map((verb) => ({
			label: cutText(t(`commands/report:menu${capitalize(verb)}`), 100),
			description: cutText(t(`commands/report:menu${capitalize(verb)}Description`), 100),
			value: verb
		}))
	};
}

/**
 * Changes the menu of a report that is shown to offer to block the member who made it, or to let them report again.
 *
 * @param components - The components of the message of the report.
 * @param t - The function to translate with, in the language of the guild.
 * @param reportId - The ID of the report.
 * @param reporterBlocked - Whether the member who made the report is blocked from reporting.
 */
export function setReportReporterBlocked(
	components: readonly APIMessageTopLevelComponent[],
	t: Translator,
	reportId: string,
	reporterBlocked: boolean
): APIMessageTopLevelComponent[] {
	return mapContainer(components, (children) =>
		children.map((child) =>
			child.type === ComponentType.ActionRow && child.components.some((entry) => entry.type === ComponentType.StringSelect)
				? { type: ComponentType.ActionRow, components: [renderReportMenu(t, reportId, reporterBlocked)] }
				: child
		)
	);
}

/**
 * Closes a report: its buttons are removed and what was done with it is written under it.
 *
 * @param components - The components of the message of the report.
 * @param status - What was done with the report, and by whom.
 */
export function closeReport(components: readonly APIMessageTopLevelComponent[], status: string): APIMessageTopLevelComponent[] {
	return mapContainer(components, (children) => [
		...children.filter((child) => child.type !== ComponentType.ActionRow),
		{ type: ComponentType.Separator },
		{ type: ComponentType.TextDisplay, content: status }
	]).map((component) => (component.type === ComponentType.Container ? { ...component, accent_color: ClosedAccentColor } : component));
}

/**
 * Writes a note on a report that stays open, such as who deleted its message, and disables the buttons that are of no
 * more use.
 *
 * @param components - The components of the message of the report.
 * @param note - What happened, and who did it.
 * @param disable - The verb of the buttons to disable, if any.
 */
export function addReportNote(components: readonly APIMessageTopLevelComponent[], note: string, disable?: ReportVerb): APIMessageTopLevelComponent[] {
	return mapContainer(components, (children) => {
		const rows = children.filter((child) => child.type === ComponentType.ActionRow);
		const rest = children.filter((child) => child.type !== ComponentType.ActionRow);
		return [
			...rest,
			{ type: ComponentType.Separator, divider: true, spacing: SeparatorSpacingSize.Small },
			{ type: ComponentType.TextDisplay, content: note },
			...rows.map((entry) => ({
				...entry,
				components: entry.components.map((child) =>
					disable !== undefined && child.type === ComponentType.Button && 'custom_id' in child && child.custom_id.includes(`.${disable}:`)
						? { ...child, disabled: true }
						: child
				)
			}))
		] as APIComponentInContainer[];
	});
}

/**
 * The modal a member writes the reason of their report in.
 *
 * @param t - The function to translate with, in the language of the member.
 * @param subject - What is reported.
 */
export function renderReportModal(t: Translator, subject: ReportSubject): APIModalInteractionResponseCallbackData {
	const { message } = subject;
	return {
		custom_id: encodeReportId({ verb: 'new', id: subject.targetId, messageId: message?.id ?? null, submit: true }),
		title: cutText(t(message === null ? 'commands/report:modalTitleUser' : 'commands/report:modalTitleMessage'), 45),
		components: [
			textInput(ReportReasonInputId, t('commands/report:modalReasonLabel'), {
				style: TextInputStyle.Paragraph,
				placeholder: t('commands/report:modalReasonPlaceholder'),
				required: true,
				min_length: 5,
				max_length: ReportReasonMaximumLength
			})
		]
	};
}

/**
 * The modal a moderator confirms a moderation action in: its reason, which a note needs, and how long it lasts, which a
 * timeout needs and a mute or a ban may have.
 *
 * @param t - The function to translate with, in the language of the moderator.
 * @param reportId - The ID of the report.
 * @param verb - The action.
 */
export function renderReportActionModal(t: Translator, reportId: string, verb: ReportModerationVerb): APIModalInteractionResponseCallbackData {
	// A note is its reason, so it cannot be empty:
	const isNote = verb === 'note';
	const components = [
		textInput(ReportReasonInputId, t(isNote ? 'commands/report:actionNoteLabel' : 'commands/report:actionReasonLabel'), {
			style: TextInputStyle.Paragraph,
			required: isNote,
			max_length: ReportReasonMaximumLength
		})
	];
	if (verb === 'timeout') {
		components.unshift(
			textInput(ReportDurationInputId, t('commands/report:actionDurationLabel'), {
				style: TextInputStyle.Short,
				required: true,
				value: '1h',
				max_length: 32
			})
		);
	} else if (verb === 'mute' || verb === 'ban') {
		components.unshift(
			textInput(ReportDurationInputId, t('commands/report:actionDurationOptionalLabel'), {
				style: TextInputStyle.Short,
				required: false,
				max_length: 32
			})
		);
	}

	return {
		custom_id: encodeReportId({ verb, id: reportId, messageId: null, submit: true }),
		title: cutText(t(`commands/report:actionTitle${capitalize(verb)}`), 45),
		components
	};
}

function capitalize<const Value extends string>(value: Value) {
	return `${value[0].toUpperCase()}${value.slice(1)}` as Capitalize<Value>;
}

/**
 * Quotes a text, so what a member wrote cannot be read as part of the report.
 */
function quote(content: string) {
	return content
		.split('\n')
		.map((line) => `> ${line}`)
		.join('\n');
}

function mapContainer(
	components: readonly APIMessageTopLevelComponent[],
	map: (children: APIComponentInContainer[]) => APIComponentInContainer[]
): APIMessageTopLevelComponent[] {
	return components.map((component) =>
		component.type === ComponentType.Container ? { ...component, components: map([...component.components]) } : component
	);
}

function row(components: APIButtonComponentWithCustomId[]): APIActionRowComponent<APIButtonComponentWithCustomId> {
	return { type: ComponentType.ActionRow, components };
}

function button(customId: string, label: string, style: APIButtonComponentWithCustomId['style']): APIButtonComponentWithCustomId {
	return { type: ComponentType.Button, custom_id: customId, label: cutText(label, 80), style };
}

function textInput(
	customId: string,
	label: string,
	options: { style: TextInputStyle; required: boolean; placeholder?: string; value?: string; min_length?: number; max_length?: number }
): APIModalInteractionResponseCallbackData['components'][number] {
	return {
		type: ComponentType.ActionRow,
		components: [{ type: ComponentType.TextInput, custom_id: customId, label: cutText(label, 45), ...options }]
	};
}
