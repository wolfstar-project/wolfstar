import type { LanguageHelpDisplayOptions } from '#lib/i18n/LanguageHelp';
import { FT, T } from '#lib/types';

export const HelpAllFlag = FT<{ prefix: string }, string>('commands/general:helpAllFlag');
export const HelpCommandCount = FT<{ count: number }, string>('commands/general:helpCommandCount');
export const HelpData = FT<{ titleDescription: string; footerName: string }, { title: string; footer: string }>('commands/general:helpData');
export const HelpDescription = T('commands/general:helpDescription');
export const HelpDm = T('commands/general:helpDm');
export const HelpExtended = T<LanguageHelpDisplayOptions>('commands/general:helpExtended');
export const HelpNoDm = T('commands/general:helpNodm');
export const V7SkyraDescription = T('commands/general:v7SkyraDescription');
export const V7SkyraExtended = T<LanguageHelpDisplayOptions>('commands/general:v7SkyraExtended');
export const V7SkyraMessage = FT<{ command: string }>('commands/general:v7SkyraMessage');
export const V7NayreMessage = FT<{ command: string }>('commands/general:v7NayreMessage');
export const V7Description = T('commands/general:v7SkyraDescription');
export const V7Extended = T<LanguageHelpDisplayOptions>('commands/general:v7SExtended');
export const V7Message = FT<{ command: string }>('commands/general:v7Message');

export interface InfoComponentLabels {
	addToServer: string;
	supportServer: string;
	repository: string;
	donate: string;
}

export interface StatsGeneral {
	channels: number;
	guilds: number;
	nodeJs: string;
	users: number;
	djsVersion: string;
	sapphireVersion: string;
}

export interface StatsUptime {
	client: string;
	host: string;
	total: string;
}

export interface StatsUsage {
	cpuLoad: string;
	ramTotal: number;
	ramUsed: number;
}
