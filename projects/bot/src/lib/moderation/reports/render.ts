import type { Translator } from '#lib/structures/commands/utils';
import { encodeReportId, type ReportAction, type ReportModerationVerb, type ReportVerb } from '#lib/moderation/reports/ids';
import type { ReportSubject } from '#lib/moderation/reports/pending';
import { channelMention, hyperlink, messageLink, roleMention, time, TimestampStyles, userMention } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import {
	ButtonStyle,
	ComponentType,
	MessageFlags,
	TextInputStyle,
	type APIActionRowComponent,
	type APIButtonComponentWithCustomId,
	type APIComponentInContainer,
	type APIMessageTopLevelComponent,
	type APIModalInteractionResponseCallbackData,
	type RESTPostAPIChannelMessageJSONBody,
	type Snowflake
} from 'discord-api-types/v10';

const AccentColor = 0xed4245;
const ClosedAccentColor = 0x4f545c;

/**
 * The longest reason a report or a moderation action taken from one has.
 */
export const ReportReasonMaximumLength = 500;

/**
 * How much of a reported message a report quotes.
 */
const ContentMaximumLength = 1000;

/**
 * The custom IDs of the inputs of the modals of the reports.
 */
export const ReportReasonInputId = 'reason';
export const ReportDurationInputId = 'duration';

export interface ReportData {
	guildId: Snowflake;
	reporterId: Snowflake;
	reason: string;
	subject: ReportSubject;

	/**
	 * When the report was made, in milliseconds.
	 */
	createdAt: number;

	/**
	 * The role to mention with the report, if any.
	 */
	roleId: Snowflake | null;
}

/**
 * Renders the report the moderators get: what was reported, by whom and why, with the buttons to act on it.
 *
 * @param t - The function to translate with, in the language of the guild.
 * @param data - The report.
 */
export function renderReport(t: Translator, data: ReportData): Pick<RESTPostAPIChannelMessageJSONBody, 'components' | 'flags' | 'allowed_mentions'> {
	const { subject } = data;
	const { message } = subject;
	const id = (verb: ReportVerb) =>
		encodeReportId({ verb, targetId: subject.targetId, channelId: message?.channelId ?? null, messageId: message?.id ?? null, submit: false });

	const target = { mention: userMention(subject.targetId), tag: subject.targetTag, id: subject.targetId };
	const lines = [`## ${t(message === null ? 'commands/report:titleUser' : 'commands/report:titleMessage')}`];
	if (message === null) {
		lines.push(t('commands/report:fieldUser', target));
	} else {
		const link = hyperlink(t('commands/report:fieldMessageLink'), messageLink(message.channelId, message.id, data.guildId));
		lines.push(t('commands/report:fieldMessage', { link, channel: channelMention(message.channelId) }), t('commands/report:fieldAuthor', target));
	}

	lines.push(
		t('commands/report:fieldReportedBy', { mention: userMention(data.reporterId) }),
		t('commands/report:fieldReportedAt', { time: time(Math.floor(data.createdAt / 1000), TimestampStyles.LongDateTime) }),
		t('commands/report:fieldReason', { reason: quote(cutText(data.reason, ReportReasonMaximumLength)) })
	);

	if (message !== null) {
		const content = message.content.trim();
		lines.push(
			t('commands/report:fieldContent', {
				content: content.length === 0 ? t('commands/report:fieldContentEmpty') : quote(cutText(content, ContentMaximumLength))
			}),
			t('commands/report:fieldMedia', {
				media:
					message.attachments.length === 0
						? t('commands/report:mediaNone')
						: message.attachments.map((url, index) => hyperlink(String(index + 1), url)).join(' · ')
			})
		);
	}

	const moderation = row([
		button(id('warn'), t('commands/report:buttonWarn'), ButtonStyle.Secondary),
		button(id('timeout'), t('commands/report:buttonTimeout'), ButtonStyle.Primary),
		button(id('kick'), t('commands/report:buttonKick'), ButtonStyle.Danger),
		button(id('ban'), t('commands/report:buttonBan'), ButtonStyle.Danger)
	]);
	const closing = row([
		...(message === null ? [] : [button(id('delete'), t('commands/report:buttonDelete'), ButtonStyle.Secondary)]),
		button(id('dismiss'), t('commands/report:buttonDismiss'), ButtonStyle.Secondary)
	]);

	const components: APIMessageTopLevelComponent[] = [];
	// The mention is outside of the container, so the report reads the same once it is closed:
	if (data.roleId !== null) components.push({ type: ComponentType.TextDisplay, content: roleMention(data.roleId) });
	components.push({
		type: ComponentType.Container,
		accent_color: AccentColor,
		components: [{ type: ComponentType.TextDisplay, content: lines.join('\n') }, moderation, closing]
	});

	return {
		components,
		flags: MessageFlags.IsComponentsV2,
		// Only the role is notified: the users are mentioned to be clickable, and what was quoted mentions nobody.
		allowed_mentions: { parse: [], roles: data.roleId === null ? [] : [data.roleId] }
	};
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
 * Notes on a report that its message was deleted, and disables the button that deletes it. The report stays open,
 * since the member who wrote the message may still need an action.
 *
 * @param components - The components of the message of the report.
 * @param note - Who deleted the message.
 */
export function markReportMessageDeleted(components: readonly APIMessageTopLevelComponent[], note: string): APIMessageTopLevelComponent[] {
	return mapContainer(components, (children) => {
		const rows = children.filter((child) => child.type === ComponentType.ActionRow);
		const rest = children.filter((child) => child.type !== ComponentType.ActionRow);
		return [
			...rest,
			{ type: ComponentType.TextDisplay, content: note },
			...rows.map((entry) => ({
				...entry,
				components: entry.components.map((child) =>
					child.type === ComponentType.Button && 'custom_id' in child && child.custom_id.includes('.delete:')
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
		custom_id: encodeReportId({
			verb: 'new',
			targetId: subject.targetId,
			channelId: message?.channelId ?? null,
			messageId: message?.id ?? null,
			submit: true
		}),
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
 * The modal a moderator confirms a moderation action in: its reason and, for a timeout, how long it lasts.
 *
 * @param t - The function to translate with, in the language of the moderator.
 * @param action - The button that was clicked.
 */
export function renderReportActionModal(
	t: Translator,
	action: ReportAction & { verb: ReportModerationVerb }
): APIModalInteractionResponseCallbackData {
	const components = [
		textInput(ReportReasonInputId, t('commands/report:actionReasonLabel'), {
			style: TextInputStyle.Paragraph,
			required: false,
			max_length: ReportReasonMaximumLength
		})
	];
	if (action.verb === 'timeout') {
		components.unshift(
			textInput(ReportDurationInputId, t('commands/report:actionDurationLabel'), {
				style: TextInputStyle.Short,
				required: true,
				value: '1h',
				max_length: 32
			})
		);
	}

	return {
		custom_id: encodeReportId({ ...action, submit: true }),
		title: cutText(t(`commands/report:actionTitle${capitalize(action.verb)}`), 45),
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
