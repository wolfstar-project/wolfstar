import type { AutoModerationCommand } from '#lib/moderation/structures/AutoModerationCommand';

const Root = 'commands/auto-moderation';

/**
 * The configuration of every auto-moderation rule command, declared once and given as the piece options of the
 * `show`, `edit` and `reset` subcommands of the rule (and of the extra ones, such as the `add` and `remove` of the
 * `words`), see {@linkcode AutoModerationCommand}.
 */
export const AutoModerationRules = {
	attachments: {
		commandName: 'automod-attachments',
		localizedNameKey: `${Root}:attachments`,
		adderPropertyName: 'attachments',
		keyEnabled: 'automodAttachmentsEnabled',
		keyOnInfraction: 'automodAttachmentsSoftAction',
		keyPunishment: 'automodAttachmentsHardAction',
		keyPunishmentDuration: 'automodAttachmentsHardActionDuration',
		keyPunishmentThreshold: 'automodAttachmentsThresholdMaximum',
		keyPunishmentThresholdPeriod: 'automodAttachmentsThresholdDuration'
	},
	capitals: {
		commandName: 'automod-capitals',
		localizedNameKey: `${Root}:capitals`,
		adderPropertyName: 'capitals',
		keyEnabled: 'automodCapitalsEnabled',
		keyOnInfraction: 'automodCapitalsSoftAction',
		keyPunishment: 'automodCapitalsHardAction',
		keyPunishmentDuration: 'automodCapitalsHardActionDuration',
		keyPunishmentThreshold: 'automodCapitalsThresholdMaximum',
		keyPunishmentThresholdPeriod: 'automodCapitalsThresholdDuration'
	},
	invites: {
		commandName: 'automod-invites',
		localizedNameKey: `${Root}:invites`,
		adderPropertyName: 'invites',
		keyEnabled: 'automodInvitesEnabled',
		keyOnInfraction: 'automodInvitesSoftAction',
		keyPunishment: 'automodInvitesHardAction',
		keyPunishmentDuration: 'automodInvitesHardActionDuration',
		keyPunishmentThreshold: 'automodInvitesThresholdMaximum',
		keyPunishmentThresholdPeriod: 'automodInvitesThresholdDuration'
	},
	links: {
		commandName: 'automod-links',
		localizedNameKey: `${Root}:links`,
		adderPropertyName: 'links',
		keyEnabled: 'automodLinksEnabled',
		keyOnInfraction: 'automodLinksSoftAction',
		keyPunishment: 'automodLinksHardAction',
		keyPunishmentDuration: 'automodLinksHardActionDuration',
		keyPunishmentThreshold: 'automodLinksThresholdMaximum',
		keyPunishmentThresholdPeriod: 'automodLinksThresholdDuration'
	},
	newlines: {
		commandName: 'automod-newlines',
		localizedNameKey: `${Root}:newlines`,
		adderPropertyName: 'newlines',
		keyEnabled: 'automodNewlinesEnabled',
		keyOnInfraction: 'automodNewlinesSoftAction',
		keyPunishment: 'automodNewlinesHardAction',
		keyPunishmentDuration: 'automodNewlinesHardActionDuration',
		keyPunishmentThreshold: 'automodNewlinesThresholdMaximum',
		keyPunishmentThresholdPeriod: 'automodNewlinesThresholdDuration'
	},
	words: {
		commandName: 'automod-words',
		localizedNameKey: `${Root}:words`,
		resetKeys: [{ key: `${Root}:optionsKeyWords`, value: 'words' }],
		adderPropertyName: 'words',
		keyEnabled: 'automodWordsEnabled',
		keyOnInfraction: 'automodWordsSoftAction',
		keyPunishment: 'automodWordsHardAction',
		keyPunishmentDuration: 'automodWordsHardActionDuration',
		keyPunishmentThreshold: 'automodWordsThresholdMaximum',
		keyPunishmentThresholdPeriod: 'automodWordsThresholdDuration'
	}
} as const satisfies Record<string, AutoModerationCommand.Rule>;
