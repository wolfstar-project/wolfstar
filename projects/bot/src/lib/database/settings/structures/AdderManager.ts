import type { ReadonlyGuildData } from 'wolfstar-database';
import { Adder } from '#lib/database/utils/Adder';
import { isNullishOrZero, type Nullish } from '@sapphire/utilities';

export type AdderKey = 'attachments' | 'capitals' | 'invites' | 'links' | 'mentions' | 'newlines' | 'words' | 'zalgo';

export class AdderManager {
	public attachments: Adder<string> | null;
	public capitals: Adder<string> | null;
	public invites: Adder<string> | null;
	public links: Adder<string> | null;
	public mentions: Adder<string> | null;
	public newlines: Adder<string> | null;
	public words: Adder<string> | null;
	public zalgo: Adder<string> | null;

	public constructor(settings: ReadonlyGuildData) {
		this.attachments = this.makeAdder(settings.automodAttachmentsThresholdMaximum, settings.automodAttachmentsThresholdDuration);
		this.capitals = this.makeAdder(settings.automodCapitalsThresholdMaximum, settings.automodCapitalsThresholdDuration);
		this.invites = this.makeAdder(settings.automodInvitesThresholdMaximum, settings.automodInvitesThresholdDuration);
		this.links = this.makeAdder(settings.automodLinksThresholdMaximum, settings.automodLinksThresholdDuration);
		this.mentions = this.makeAdder(settings.automodMentionsThresholdMaximum, settings.automodMentionsThresholdDuration);
		this.newlines = this.makeAdder(settings.automodNewlinesThresholdMaximum, settings.automodNewlinesThresholdDuration);
		this.words = this.makeAdder(settings.automodWordsThresholdMaximum, settings.automodWordsThresholdDuration);
		this.zalgo = this.makeAdder(settings.automodZalgoThresholdMaximum, settings.automodZalgoThresholdDuration);
	}

	public onPatch(settings: ReadonlyGuildData): void {
		this.attachments = this.updateAdder(
			this.attachments,
			settings.automodAttachmentsThresholdMaximum,
			settings.automodAttachmentsThresholdDuration
		);
		this.capitals = this.updateAdder(this.capitals, settings.automodCapitalsThresholdMaximum, settings.automodCapitalsThresholdDuration);
		this.invites = this.updateAdder(this.invites, settings.automodInvitesThresholdMaximum, settings.automodInvitesThresholdDuration);
		this.links = this.updateAdder(this.links, settings.automodLinksThresholdMaximum, settings.automodLinksThresholdDuration);
		this.mentions = this.updateAdder(this.mentions, settings.automodMentionsThresholdMaximum, settings.automodMentionsThresholdDuration);
		this.newlines = this.updateAdder(this.newlines, settings.automodNewlinesThresholdMaximum, settings.automodNewlinesThresholdDuration);
		this.words = this.updateAdder(this.words, settings.automodWordsThresholdMaximum, settings.automodWordsThresholdDuration);
		this.zalgo = this.updateAdder(this.zalgo, settings.automodZalgoThresholdMaximum, settings.automodZalgoThresholdDuration);
	}

	private makeAdder(maximum: number | Nullish, duration: number | Nullish) {
		if (isNullishOrZero(maximum) || isNullishOrZero(duration)) return null;
		return new Adder<string>(maximum, duration, true);
	}

	private updateAdder(adder: Adder<string> | null, maximum: number | Nullish, duration: number | Nullish) {
		if (isNullishOrZero(maximum) || isNullishOrZero(duration)) return null;
		if (!adder || adder.maximum !== maximum || adder.duration !== duration) return new Adder<string>(maximum, duration, true);
		return adder;
	}
}
