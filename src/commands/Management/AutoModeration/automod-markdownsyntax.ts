import { LanguageKeys } from '#lib/i18n/languageKeys';
import { AutoModerationCommand } from '#lib/moderation';
import { ApplyOptions } from '@sapphire/decorators';

const Root = LanguageKeys.Commands.AutoModeration;

@ApplyOptions<AutoModerationCommand.Options>({
    aliases: ['automod-markdown', 'markdown-filter', 'syntax-filter'],
    description: Root.MarkdownSyntaxDescription, // Placeholder - will be added in language files later
    localizedNameKey: Root.MarkdownSyntaxName, // Placeholder - will be added in language files later
    adderPropertyName: 'markdownSyntax', // This is a unique property name for this automod feature
    keyEnabled: 'selfmodMarkdownSyntaxEnabled',
    keyOnInfraction: 'selfmodMarkdownSyntaxSoftAction',
    keyPunishment: 'selfmodMarkdownSyntaxHardAction',
    keyPunishmentDuration: 'selfmodMarkdownSyntaxHardActionDuration',
    keyPunishmentThreshold: 'selfmodMarkdownSyntaxThresholdMaximum',
    keyPunishmentThresholdPeriod: 'selfmodMarkdownSyntaxThresholdDuration',
    // Example placeholder for pattern-specific threshold keys, if we add them later:
    // keyMaxSpoilers: 'selfmodMarkdownSyntaxMaxSpoilers',
    // keyMaxBackticksPercent: 'selfmodMarkdownSyntaxMaxBackticksPercent',
    // keyMaxEmphasisCharactersPercent: 'selfmodMarkdownSyntaxMaxEmphasisCharactersPercent',
    idHints: [
        // TODO: Add a production ID hint if this bot has a public instance and tracking
        // e.g., '123456789012345678'
    ]
})
export class UserAutoModerationCommand extends AutoModerationCommand {}
