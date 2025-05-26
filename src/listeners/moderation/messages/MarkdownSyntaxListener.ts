import { LanguageKeys } from '#lib/i18n/languageKeys';
import { readSettings, type GuildSettingsOfType, type HardPunishment } from '#lib/database';
import { ModerationMessageListener } from '#lib/moderation';
import { getTag } from '#lib/util/functions';
import { Listener, type Awaitable } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import type { GuildMessage } from '#lib/types';
// import { TLD } from '#utils/Links/TLDs'; // Import TLD for regex generation if needed, or just use string
import { floatPromise } from '#utils/common';

// Define a type for the data returned by preProcess if an infraction is found
interface MarkdownSyntaxInfraction {
    type: 'spoiler' | 'backtick' | 'emphasis';
    count?: number;
    percentage?: number;
    threshold: string; // Describe the threshold that was breached (e.g., '>5 tags', '>70% content')
}

// Define default thresholds if not set in guild settings (optional, or fetch all from settings)
const DEFAULT_MAX_SPOILERS_COUNT = 5;
const DEFAULT_MAX_SPOILERS_PERCENTAGE = 0.7; // 70%
const DEFAULT_MAX_BACKTICKS_COUNT = 3;
const DEFAULT_MAX_BACKTICKS_PERCENTAGE = 0.7; // 70%
const DEFAULT_MAX_EMPHASIS_COUNT = 5; // Number of "overuse" sequences like ***
const DEFAULT_MAX_EMPHASIS_PERCENTAGE = 0.8; // 80%

@ApplyOptions<Listener.Options>({
    event: 'userMessage', // Assuming this is the correct event for new/edited messages from users
    category: 'Moderation'
})
export class MarkdownSyntaxListener extends ModerationMessageListener<MarkdownSyntaxInfraction> {
    // Link to settings keys defined in automod-markdownsyntax.ts
    protected override readonly keyEnabled: GuildSettingsOfType<boolean> = 'selfmodMarkdownSyntaxEnabled';
    protected override readonly softPunishmentPath: GuildSettingsOfType<number> = 'selfmodMarkdownSyntaxSoftAction';
    protected override readonly hardPunishmentPath: HardPunishment = {
        action: 'selfmodMarkdownSyntaxHardAction',
        actionDuration: 'selfmodMarkdownSyntaxHardActionDuration',
        thresholdMaximum: 'selfmodMarkdownSyntaxThresholdMaximum',
        thresholdDuration: 'selfmodMarkdownSyntaxThresholdDuration'
    };

    public override async run(message: GuildMessage) {
        // In this framework, 'run' is often the entry point for listeners that handle events.
        // It then calls preProcess and process.
		const result = await this.preProcess(message);
		if (result !== null) {
			await this.process(message, result);
		}
	}

    protected override async preProcess(message: GuildMessage): Promise<MarkdownSyntaxInfraction | null> {
        // Early exit if message is from a bot or system, or if content is empty
        if (message.author.bot || message.system || message.content.length === 0) {
            return null;
        }

        const settings = await readSettings(message.guild);

        // Check if the feature is enabled
        if (!settings[this.keyEnabled]) {
            return null;
        }

        const content = message.content;
        const contentLength = content.replace(/\s/g, '').length; // Content length without whitespace
        if (contentLength === 0) return null;

        // 1. Excessive Spoilers Check
        const spoilerRegex = /\|\|.*?\|\|/gs;
        const spoilers = content.match(spoilerRegex);
        const spoilerCount = spoilers ? spoilers.length : 0;
        // Calculate spoiler content length more accurately: sum of lengths of content inside || ||
        let spoilerContentLength = 0;
        if (spoilers) {
            spoilers.forEach(s => spoilerContentLength += s.length - 4); // Subtract the four || characters
        }
        const spoilerPercentage = contentLength > 0 ? spoilerContentLength / contentLength : 0;

        // Retrieve specific thresholds from settings, or use defaults
        // These specific threshold keys should be added to GuildSettings if they are to be configurable
        const maxSpoilersCount = (settings as any).selfmodMarkdownSyntaxMaxSpoilersCount ?? DEFAULT_MAX_SPOILERS_COUNT;
        const maxSpoilersPercentage = (settings as any).selfmodMarkdownSyntaxMaxSpoilersPercentage ?? DEFAULT_MAX_SPOILERS_PERCENTAGE;

        if (spoilerCount > maxSpoilersCount) {
            return { type: 'spoiler', count: spoilerCount, threshold: `>${maxSpoilersCount} tags` };
        }
        if (contentLength > 0 && spoilerPercentage > maxSpoilersPercentage) {
            return { type: 'spoiler', percentage: spoilerPercentage, threshold: `>${maxSpoilersPercentage * 100}% content` };
        }

        // 2. Excessive Code Backticks Check
        const codeBlockRegex = /```(?:[a-zA-Z0-9_\-]+)?\n[\s\S]*?\n```/g;
        const inlineCodeRegex = /`[^`\n]+`/g;
        
        const codeBlocks = content.match(codeBlockRegex) || [];
        const inlineCodes = content.match(inlineCodeRegex) || [];
        const backtickCount = codeBlocks.length + inlineCodes.length;

        let backtickContentLength = 0;
        codeBlocks.forEach(block => {
            const match = block.match(/```(?:[a-zA-Z0-9_\-]+)?\n([\s\S]*?)\n```/);
            if (match && match[1]) backtickContentLength += match[1].length;
        });
        inlineCodes.forEach(inline => backtickContentLength += inline.length - 2); // Subtract ``

        const backtickPercentage = contentLength > 0 ? backtickContentLength / contentLength : 0;
        
        const maxBackticksCount = (settings as any).selfmodMarkdownSyntaxMaxBackticksCount ?? DEFAULT_MAX_BACKTICKS_COUNT;
        const maxBackticksPercentage = (settings as any).selfmodMarkdownSyntaxMaxBackticksPercentage ?? DEFAULT_MAX_BACKTICKS_PERCENTAGE;

        if (backtickCount > maxBackticksCount) {
            return { type: 'backtick', count: backtickCount, threshold: `>${maxBackticksCount} blocks/inline` };
        }
        if (contentLength > 0 && backtickPercentage > maxBackticksPercentage) {
            return { type: 'backtick', percentage: backtickPercentage, threshold: `>${maxBackticksPercentage * 100}% content` };
        }

        // 3. Overuse of Bold/Italics/Strikethrough (Emphasis)
        const emphasisCharsRegex = /[*_~]/g;
        // Matches 3 or more *consecutive identical* emphasis characters, e.g., ***, ___, ~~~
        // It also tries to avoid matching them inside code blocks or spoilers, though this is hard with regex.
        const emphasisSequenceRegex = /(?<![\`|])(?:\*\*\*+|___+|~~~+)(?![\`|])/g;


        const emphasisCharMatches = content.match(emphasisCharsRegex);
        const emphasisCharCount = emphasisCharMatches ? emphasisCharMatches.length : 0;
        const emphasisPercentage = contentLength > 0 ? emphasisCharCount / contentLength : 0;

        const emphasisSequences = content.match(emphasisSequenceRegex);
        const emphasisSequenceCount = emphasisSequences ? emphasisSequences.length : 0;
        
        const maxEmphasisCount = (settings as any).selfmodMarkdownSyntaxMaxEmphasisCount ?? DEFAULT_MAX_EMPHASIS_COUNT;
        const maxEmphasisPercentage = (settings as any).selfmodMarkdownSyntaxMaxEmphasisPercentage ?? DEFAULT_MAX_EMPHASIS_PERCENTAGE;

        if (emphasisSequenceCount > maxEmphasisCount) {
            return { type: 'emphasis', count: emphasisSequenceCount, threshold: `>${maxEmphasisCount} sequences` };
        }
        if (contentLength > 0 && emphasisPercentage > maxEmphasisPercentage) {
            return { type: 'emphasis', percentage: emphasisPercentage, threshold: `>${maxEmphasisPercentage*100}% content` };
        }

        return null; // No infractions found
    }

    protected override async onLogMessage(message: GuildMessage, data: MarkdownSyntaxInfraction): Promise<string> {
        const { t } = await readSettings(message.guild);
        const user = getTag(message.author);
        let settingKey: string; // To be used if we add specific language keys per type
        let logData = {
            user,
            count: data.count,
            percentage: data.percentage ? Math.round(data.percentage * 100) : undefined, // Use undefined if null/0
            threshold: data.threshold,
            type: data.type
        };

        // Select the appropriate language key based on the infraction type
        // These keys (e.g., LanguageKeys.Moderation.MarkdownSyntaxSpoiler) will be defined later
        switch (data.type) {
            case 'spoiler':
                settingKey = LanguageKeys.Moderation.MarkdownSyntaxSpoiler;
                break;
            case 'backtick':
                settingKey = LanguageKeys.Moderation.MarkdownSyntaxBacktick;
                break;
            case 'emphasis':
                settingKey = LanguageKeys.Moderation.MarkdownSyntaxEmphasis;
                break;
            default:
                // Fallback generic message - this shouldn't normally be hit if types are correct
                settingKey = LanguageKeys.Moderation.MarkdownSyntaxGeneric;
        }
        
        return t(settingKey, logData);
    }

    // No need for preProcessRun if `run` calls preProcess and then process.
    // The ModerationMessageListener's `process` method should handle `floatPromise` if needed internally
    // or be awaited by `run`. The base class `process` method handles the soft/hard actions.
}

// Registration of the listener will be handled by Sapphire's listener loading mechanism
// if placed in the correct directory and correctly extending Listener.
