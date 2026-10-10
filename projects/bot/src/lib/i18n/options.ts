import { readSettings } from '#lib/database/settings';
import { getHandler } from '#lib/i18n/structures/Handler';
import { Emojis, LanguageFormatters } from '#utils/constants';
import { time, TimestampStyles } from '@discordjs/formatters';
import { i18next, type I18nextFormatter, type InternationalizationOptions } from '@wolfstar/plugin-i18next';
import { GuildDefaultMessageNotifications, GuildExplicitContentFilter, GuildVerificationLevel, PermissionFlagsBits } from 'discord-api-types/v10';
import type { InterpolationOptions } from 'i18next';
import { fileURLToPath } from 'node:url';

/**
 * The options of the translations: where the locales are, the language of each guild, the formatters the locale files
 * use (`{{value, duration}}`, `{{value, permissions}}`…) and the variables every text can use (`{{GREENTICK}}`…).
 */
export function parseInternationalizationOptions(): InternationalizationOptions {
	return {
		defaultMissingKey: 'default',
		defaultNS: 'globals',
		defaultName: 'en-US',
		defaultLanguageDirectory: fileURLToPath(new URL('../../locales', import.meta.url)),
		fetchLanguage: async ({ guildId }) => {
			if (!guildId) return 'en-US';
			return (await readSettings(guildId)).language;
		},
		formatters: parseInternationalizationFormatters(),
		i18next: (_: string[], languages: string[]) => ({
			supportedLngs: languages,
			preload: languages,
			returnObjects: true,
			returnEmptyString: false,
			returnNull: false,
			load: 'all',
			lng: 'en-US',
			fallbackLng: {
				'es-419': ['es-ES', 'en-US'], // Latin America Spanish falls back to Spain Spanish
				default: ['en-US']
			},
			defaultNS: 'globals',
			overloadTranslationOptionHandler: (args) => ({ defaultValue: args[1] ?? 'globals:default' }),
			initImmediate: false,
			interpolation: parseInternationalizationInterpolation()
		})
	};
}

function parseInternationalizationInterpolation(): InterpolationOptions {
	return { escapeValue: false, defaultVariables: parseInternationalizationDefaultVariables() };
}

function parseInternationalizationDefaultVariables() {
	return {
		VERSION: process.env.CLIENT_VERSION,
		LOADING: Emojis.Loading,
		GREENTICK: Emojis.GreenTick,
		REDCROSS: Emojis.RedCross,
		CLIENT_ID: process.env.CLIENT_ID,
		...parseInternationalizationDefaultVariablesPermissions()
	};
}

/**
 * The names of the permissions, so that a text can write `{{BanMembers, permissions}}`.
 */
function parseInternationalizationDefaultVariablesPermissions() {
	const keys = Object.keys(PermissionFlagsBits) as readonly (keyof typeof PermissionFlagsBits)[];
	const entries = keys.map((key) => [key, key] as const);

	return Object.fromEntries(entries) as Readonly<Record<keyof typeof PermissionFlagsBits, keyof typeof PermissionFlagsBits>>;
}

function parseInternationalizationFormatters(): I18nextFormatter[] {
	// Resolved at call time: the alias formatters translate another key with the same instance.
	const t = (key: string, options: Record<string, unknown>) =>
		(i18next.t as (key: string, options: Record<string, unknown>) => string)(key, options);

	return [
		// Add custom formatters:
		{
			name: LanguageFormatters.Number,
			format: (lng, options) => {
				const formatter = new Intl.NumberFormat(lng, { maximumFractionDigits: 2, ...options });
				return (value) => formatter.format(value);
			},
			cached: true
		},
		{
			name: LanguageFormatters.NumberCompact,
			format: (lng, options) => {
				const formatter = new Intl.NumberFormat(lng, { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 2, ...options });
				return (value) => formatter.format(value);
			},
			cached: true
		},
		{
			name: LanguageFormatters.Duration,
			format: (lng, options) => {
				const formatter = getHandler(lng ?? 'en-US').duration;
				const precision = (options?.precision as number) ?? 2;
				return (value) => formatter.format(value, precision);
			},
			cached: true
		},
		{
			name: LanguageFormatters.HumanDateTime,
			format: (lng, options) => {
				const formatter = new Intl.DateTimeFormat(lng, { timeZone: 'Etc/UTC', dateStyle: 'short', timeStyle: 'medium', ...options });
				return (value) => formatter.format(value);
			},
			cached: true
		},
		// Add Discord markdown formatters:
		{ name: LanguageFormatters.DateTime, format: (value) => time(new Date(value), TimestampStyles.ShortDateTime) },
		// Add alias formatters:
		{
			name: LanguageFormatters.Permissions,
			format: (value, lng, options) => t(`permissions:${value}`, { lng, ...options })
		},
		{
			name: LanguageFormatters.HumanLevels,
			format: (value, lng, options) => t(`humanLevels:${GuildVerificationLevel[value]}`, { lng, ...options })
		},
		{
			name: LanguageFormatters.ExplicitContentFilter,
			format: (value, lng, options) => t(`guilds:explicitContentFilter${GuildExplicitContentFilter[value]}`, { lng, ...options })
		},
		{
			name: LanguageFormatters.MessageNotifications,
			format: (value, lng, options) => t(`guilds:defaultMessageNotifications${GuildDefaultMessageNotifications[value]}`, { lng, ...options })
		}
	];
}
