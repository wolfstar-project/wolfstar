import type { JoinGuardSignals } from '#lib/moderation/joinguard/conditions';
import { Colors, Urls } from '#utils/constants';
import { createLogMessage, type LogMessageOptions } from '#utils/functions';
import { channelMention, roleMention, time, TimestampStyles, userMention } from '@discordjs/formatters';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import { ButtonStyle, ComponentType, MessageFlags, type RESTPostAPIChannelMessageJSONBody, type Snowflake } from 'discord-api-types/v10';

const Root = 'events/join-guard';

/**
 * The page of the website where a member stopped by the join guard of a guild verifies their account.
 */
export function getJoinGuardVerifyUrl(guildId: Snowflake) {
	return `${Urls.Website}/verify/${guildId}`;
}

/**
 * What became of a member a rule stopped when they joined.
 */
export type JoinGuardOutcome =
	| { readonly kind: 'Banned'; readonly caseId: number }
	| { readonly kind: 'Kicked'; readonly caseId: number }
	| { readonly kind: 'Checkpoint'; readonly expiresAt: number | null }
	| { readonly kind: 'None' };

/**
 * What a log of the join guard tells: a member who joined and what the guard did, then what became of them.
 */
export type JoinGuardLogEntry =
	| {
			readonly kind: 'Stopped';
			readonly rules: readonly string[];
			readonly signals: JoinGuardSignals;
			readonly outcome: JoinGuardOutcome;
			readonly checkpointOff: boolean;
			readonly roles: readonly Snowflake[];
			readonly alerts: readonly Snowflake[];
			readonly directMessage: 'Sent' | 'Undelivered' | 'None';
			readonly errors: readonly string[];
	  }
	| { readonly kind: 'Verified'; readonly trust: number | null; readonly linkedAccounts: number; readonly errors: readonly string[] }
	| { readonly kind: 'VerifiedByModerator'; readonly moderatorId: Snowflake; readonly errors: readonly string[] }
	| { readonly kind: 'VerifiedByHand' }
	| { readonly kind: 'TimedOut'; readonly caseId: number }
	| { readonly kind: 'KickedByModerator'; readonly moderatorId: Snowflake; readonly caseId: number }
	| { readonly kind: 'Left' }
	| { readonly kind: 'Failed'; readonly errors: readonly string[] };

/**
 * Builds a log of the join guard, for the channel of `join-guard.log-channel`.
 *
 * @param t - The function to translate with, in the language of the guild.
 * @param user - Who the log is about.
 * @param entry - What it tells.
 */
export function renderJoinGuardLog(t: TFunction<AnyNamespace>, user: LogMessageOptions['author'], entry: JoinGuardLogEntry) {
	const mention = `${userMention(user.id)} (${user.id})`;
	const lines = getLogLines(t, mention, entry);
	return createLogMessage({ color: getLogColor(entry), author: user, content: lines.join('\n'), footer: t(`${Root}:logFooter`) });
}

function getLogLines(t: TFunction<AnyNamespace>, user: string, entry: JoinGuardLogEntry): string[] {
	switch (entry.kind) {
		case 'Stopped':
			return [
				t(`${Root}:logStopped`, { user, rules: entry.rules }),
				renderJoinGuardSignals(t, entry.signals),
				...renderOutcome(t, entry),
				...entry.errors.map((error) => t(`${Root}:logError`, { error }))
			];
		case 'Verified':
			return [
				t(`${Root}:logVerifiedCheckpoint`, { user, trust: entry.trust ?? '?', count: entry.linkedAccounts }),
				...entry.errors.map((error) => t(`${Root}:logError`, { error }))
			];
		case 'VerifiedByModerator':
			return [
				t(`${Root}:logVerifiedModerator`, { user, moderator: userMention(entry.moderatorId) }),
				...entry.errors.map((error) => t(`${Root}:logError`, { error }))
			];
		case 'VerifiedByHand':
			return [t(`${Root}:logVerifiedByHand`, { user })];
		case 'TimedOut':
			return [t(`${Root}:logTimedOut`, { user, caseId: entry.caseId })];
		case 'KickedByModerator':
			return [t(`${Root}:logKickedByModerator`, { user, moderator: userMention(entry.moderatorId), caseId: entry.caseId })];
		case 'Left':
			return [t(`${Root}:logLeft`, { user })];
		case 'Failed':
			return entry.errors.map((error) => t(`${Root}:logError`, { error }));
	}
}

function renderOutcome(t: TFunction<AnyNamespace>, entry: Extract<JoinGuardLogEntry, { kind: 'Stopped' }>): string[] {
	const lines: string[] = [];
	const { outcome } = entry;
	switch (outcome.kind) {
		case 'Banned':
			lines.push(t(`${Root}:logBanned`, { caseId: outcome.caseId }));
			break;
		case 'Kicked':
			lines.push(t(`${Root}:logKicked`, { caseId: outcome.caseId }));
			break;
		case 'Checkpoint':
			lines.push(
				outcome.expiresAt === null
					? t(`${Root}:logCheckpointNoTimeout`)
					: t(`${Root}:logCheckpoint`, { expires: time(Math.round(outcome.expiresAt / 1000), TimestampStyles.RelativeTime) })
			);
			break;
		case 'None':
			lines.push(t(`${Root}:logNotStopped`));
			break;
	}

	if (entry.checkpointOff) lines.push(t(`${Root}:logCheckpointOff`));
	if (entry.roles.length > 0) lines.push(t(`${Root}:logRoles`, { roles: entry.roles.map((role) => roleMention(role)) }));
	if (entry.alerts.length > 0) lines.push(t(`${Root}:logAlerted`, { channels: entry.alerts.map((channel) => channelMention(channel)) }));
	if (entry.directMessage === 'Sent') lines.push(t(`${Root}:logDirectMessageSent`));
	else if (entry.directMessage === 'Undelivered') lines.push(t(`${Root}:logDirectMessageUndelivered`));
	return lines;
}

function getLogColor(entry: JoinGuardLogEntry): number {
	switch (entry.kind) {
		case 'Stopped':
			if (entry.outcome.kind === 'Banned' || entry.outcome.kind === 'Kicked') return Colors.Red;
			return entry.outcome.kind === 'Checkpoint' ? Colors.Amber : Colors.Yellow;
		case 'Verified':
		case 'VerifiedByModerator':
		case 'VerifiedByHand':
			return Colors.Green;
		case 'TimedOut':
		case 'KickedByModerator':
			return Colors.Red;
		case 'Left':
			return Colors.Grey;
		case 'Failed':
			return Colors.Amber;
	}
}

/**
 * Describes what the rules saw of a member, for the log and the alerts.
 */
function renderJoinGuardSignals(t: TFunction<AnyNamespace>, signals: JoinGuardSignals): string {
	const details = [
		signals.defaultAvatar ? t(`${Root}:logSignalDefaultAvatar`) : '',
		signals.generatedName ? t(`${Root}:logSignalGeneratedName`) : '',
		signals.unverifiedBot ? t(`${Root}:logSignalUnverifiedBot`) : ''
	].join('');
	return t(`${Root}:logSignals`, { created: time(Math.round(signals.accountCreatedAt / 1000), TimestampStyles.RelativeTime), details });
}

/**
 * Builds the alert of a rule to the moderators, in the channel the rule names.
 */
export function renderJoinGuardAlert(
	t: TFunction<AnyNamespace>,
	userId: Snowflake,
	rules: readonly string[],
	signals: JoinGuardSignals
): RESTPostAPIChannelMessageJSONBody {
	return {
		content: t(`${Root}:alert`, { user: userMention(userId), id: userId, rules, signals: renderJoinGuardSignals(t, signals) }),
		allowed_mentions: { parse: [] }
	};
}

/**
 * What the direct message of the join guard tells a member about.
 */
export interface JoinGuardDirectMessage {
	/** The name of the server. */
	server: string;
	/** What the server wrote, `{server}` being its name, or `null` for the default text. */
	content: string | null;
	outcome: JoinGuardOutcome['kind'];
	/** The page that verifies the member, when they are sent to the checkpoint. */
	verifyUrl: string | null;
	/** The page that appeals a ban, when the server takes the appeals of the bans. */
	appealUrl: string | null;
}

/**
 * The placeholder of the direct message a server writes, which is replaced with its name.
 */
const ServerPlaceholder = '{server}';

/**
 * Builds the one direct message the join guard sends a member: the text of the server, or the default one, then the
 * link of the checkpoint, or what was done to them.
 */
export function renderJoinGuardDirectMessage(t: TFunction<AnyNamespace>, message: JoinGuardDirectMessage): string {
	const lines = [
		message.content === null
			? t(message.outcome === 'None' ? `${Root}:directMessageNotice` : `${Root}:directMessageStopped`, { server: message.server })
			: message.content.replaceAll(ServerPlaceholder, message.server)
	];

	if (message.outcome === 'Checkpoint' && message.verifyUrl !== null) lines.push(t(`${Root}:directMessageCheckpoint`, { url: message.verifyUrl }));
	if (message.outcome === 'Kicked') lines.push(t(`${Root}:directMessageKicked`));
	if (message.outcome === 'Banned') {
		lines.push(t(`${Root}:directMessageBanned`));
		if (message.appealUrl !== null) lines.push(t(`${Root}:directMessageAppeal`, { url: message.appealUrl }));
	}

	return lines.join('\n\n');
}

/**
 * Builds the message of the checkpoint channel: what to do, and the link button to the page that verifies a member,
 * which needs no handler.
 */
export function renderJoinGuardCheckpointButton(t: TFunction<AnyNamespace>, guildId: Snowflake) {
	return {
		components: [
			{
				type: ComponentType.Container,
				accent_color: Colors.Green,
				components: [{ type: ComponentType.TextDisplay, content: `## ${t(`${Root}:buttonTitle`)}\n${t(`${Root}:buttonDescription`)}` }]
			},
			{
				type: ComponentType.ActionRow,
				components: [
					{ type: ComponentType.Button, style: ButtonStyle.Link, label: t(`${Root}:buttonLabel`), url: getJoinGuardVerifyUrl(guildId) }
				]
			}
		],
		flags: MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	} satisfies RESTPostAPIChannelMessageJSONBody;
}
