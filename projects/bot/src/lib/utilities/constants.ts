import { getRootData } from '@sapphire/pieces';
import { PermissionFlagsBits } from 'discord-api-types/v10';
import { join } from 'node:path';

export const mainFolder = getRootData().root;
export const rootFolder = join(mainFolder, '..');

export const ZeroWidthSpace = '\u200B';
export const LongWidthSpace = '\u3000';

export const ModeratorPermissionsList = [
	['ManageChannels', PermissionFlagsBits.ManageChannels],
	['ManageRoles', PermissionFlagsBits.ManageRoles],
	['CreateGuildExpressions', PermissionFlagsBits.CreateGuildExpressions],
	['ManageGuildExpressions', PermissionFlagsBits.ManageGuildExpressions],
	['ManageWebhooks', PermissionFlagsBits.ManageWebhooks],
	['ManageGuild', PermissionFlagsBits.ManageGuild],
	['KickMembers', PermissionFlagsBits.KickMembers],
	['BanMembers', PermissionFlagsBits.BanMembers],
	['ModerateMembers', PermissionFlagsBits.ModerateMembers],
	['MentionEveryone', PermissionFlagsBits.MentionEveryone],
	['ManageMessages', PermissionFlagsBits.ManageMessages],
	['ManageThreads', PermissionFlagsBits.ManageThreads],
	['CreateEvents', PermissionFlagsBits.CreateEvents],
	['ManageEvents', PermissionFlagsBits.ManageEvents],
	['Administrator', PermissionFlagsBits.Administrator]
] as const;

export const ModeratorPermissionsBits = ModeratorPermissionsList.reduce((acc, [, bit]) => acc | bit, 0n);

export const enum BrandingColors {
	Primary = 0x050505,
	Secondary = 0xfd171b
}

export const enum Urls {
	GitHubOrganization = 'https://github.com/wolfstar-project',
	GitHubRepository = 'https://github.com/wolfstar-project/wolfstar',
	Website = 'https://wolfstar.rocks'
}

export const enum CdnUrls {
	EscapeRopeGif = 'https://cdn.wolfstar.rocks/wolfstar-assets/escape_rope.gif',
	RevolvingHeartTwemoji = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@v14.0.2/assets/72x72/1f49e.png'
}

export const enum LanguageFormatters {
	Duration = 'duration',
	ExplicitContentFilter = 'explicitContentFilter',
	MessageNotifications = 'messageNotifications',
	Number = 'number',
	NumberCompact = 'numberCompact',
	HumanLevels = 'humanLevels',
	Permissions = 'permissions',
	DateTime = 'dateTime',
	HumanDateTime = 'humanDateTime'
}

export const enum Colors {
	White = 0xe7e7e8,
	Amber = 0xffc107,
	Amber300 = 0xffd54f,
	Blue = 0x2196f3,
	BlueGrey = 0x607d8b,
	Brown = 0x795548,
	Cyan = 0x00bcd4,
	DeepOrange = 0xff5722,
	DeepPurple = 0x673ab7,
	Green = 0x4caf50,
	Grey = 0x9e9e9e,
	Indigo = 0x3f51b5,
	LightBlue = 0x03a9f4,
	LightGreen = 0x8bc34a,
	Lime = 0xcddc39,
	Lime300 = 0xdce775,
	Orange = 0xff9800,
	Pink = 0xe91e63,
	Purple = 0x9c27b0,
	Red = 0xf44336,
	Red300 = 0xe57373,
	Teal = 0x009688,
	Yellow = 0xffeb3b,
	Yellow300 = 0xfff176
}
