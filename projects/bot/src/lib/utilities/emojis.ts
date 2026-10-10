import { container } from '@wolfstar/http-framework';

/**
 * The emojis the bot writes in its messages, by the name they are used with in the code.
 *
 * @remarks
 *
 * The bot is not one application: staging, beta and production are three, and a custom emoji of an application is
 * its own, so the same emoji has a different ID in each. They are the **application emojis** of Discord, uploaded
 * once to each application with the same name, and the IDs are read from the application the bot runs as, see
 * {@linkcode loadApplicationEmojis}. What is written in this file is the name, and the emoji the bot used before the
 * application had its own, which is written when the application does not have one of that name yet.
 */
interface EmojiDefinition {
	/**
	 * The name of the emoji in the application, which is the same in every application.
	 */
	name: string;
	animated: boolean;

	/**
	 * The emoji that is written when the application of the bot has no emoji of that name.
	 */
	fallbackId: string;
}

function emoji(name: string, fallbackId: string, animated = false): EmojiDefinition {
	return { name, animated, fallbackId };
}

/**
 * Every emoji of the bot. To add one: add it here, and upload it with that name to the application of every
 * environment (staging, beta and production).
 */
export const EmojiDefinitions = {
	ArrowLeft: emoji('ArrowL', '973978245580075069'),
	ArrowRight: emoji('ArrowR', '973978026536747008'),
	ArrowLeftFast: emoji('ArrowFastL', '973976973120528484'),
	ArrowRightFast: emoji('ArrowFastR', '973977208978800640'),
	Stop: emoji('Stop', '973961000313303060'),
	BoostLevel1: emoji('boostlvl1', '935169049523019786'),
	BoostLevel2: emoji('boostlvl2', '935169110311063612'),
	BoostLevel3: emoji('boostlvl3', '935169145056686101'),
	BoostLevel4: emoji('boostlvl4', '935169181362569246'),
	BoostLevel5: emoji('boostlvl5', '935170651117998080'),
	BoostLevel6: emoji('boostlvl6', '935170683653193788'),
	BoostLevel7: emoji('boostlvl7', '935170720365944942'),
	BoostLevel8: emoji('boostlvl8', '935170763894439996'),
	BoostLevel9: emoji('boostlvl9', '935170794374447184'),
	Bot: emoji('bot', '1262395021173456916'),
	IntegrationIcon: emoji('IntegrationIcon', '1251906194759749653'),
	Frame: emoji('frame', '1262396085176107040'),
	GreenTick: emoji('greenTick', '1043562833905987685'),
	Loading: emoji('loading', '1257373445151395901', true),
	RedCross: emoji('redCross', '1043562794336919605'),
	Calendar: emoji('calendar_icon', '1262390721399492650'),
	Hourglass: emoji('hourglass', '1262391693823578245'),
	Member: emoji('member', '1262381522942558208'),
	ShieldMember: emoji('shield_member', '1262389159155335198'),
	Moderator: emoji('moderator', '1262383567388938240'),
	AutoModerator: emoji('auto_moderator', '1226106862147993650'),
	SpammerIcon: emoji('spammer', '1262395235640676353'),
	QuarantinedIcon: emoji('quarantined', '1262395690143973396'),
	Reply: emoji('reply', '1262387069909733406'),
	ReplyInactive: emoji('reply_inactive', '1262386545529196568'),
	Flag: emoji('flag', '1262387528774848522'),
	FlagInactive: emoji('flag_inactive', '1262387790348419129'),
	Timer: emoji('timer', '985524723490381826'),
	Bucket: emoji('bucket', '1262384919783411813'),
	Delete: emoji('delete', '1262382721276186704'),
	DeleteInactive: emoji('delete_inactive', '1262382743115923478'),
	Timeout: emoji('timeout', '1262379856470212659'),
	Kick: emoji('kick', '1262378332633174017'),
	Softban: emoji('softban', '1262384411245150208'),
	Ban: emoji('ban', '1262378308050489468')
} as const satisfies Record<string, EmojiDefinition>;

export type EmojiKey = keyof typeof EmojiDefinitions;

/**
 * What the application of the bot has, by name, read by {@linkcode loadApplicationEmojis}.
 */
const applicationEmojis = new Map<string, { id: string; animated: boolean }>();

/**
 * The shape of an application emoji in the response of Discord.
 */
interface ApplicationEmojiData {
	id: string;
	name: string | null;
	animated?: boolean;
}

/**
 * The emoji written in a message: `<:name:id>`, `<a:name:id>` when it is animated.
 */
export function formatEmoji(name: string, id: string, animated: boolean) {
	return `<${animated ? 'a' : ''}:${name}:${id}>`;
}

/**
 * Reads the emojis of the application the bot runs as. The IDs are of that application, so the same code writes the
 * emojis of staging, of beta and of production, which have the same names.
 *
 * @remarks It never throws: when Discord cannot be asked, or the application has none of the emojis, the emojis the bot
 * used before are written, and what is missing is logged once.
 *
 * @param applicationId - The ID of the application, the one of the bot by default.
 * @returns How many of the emojis of {@linkcode EmojiDefinitions} the application has.
 */
export async function loadApplicationEmojis(applicationId: string = process.env.CLIENT_ID): Promise<number> {
	try {
		const response = (await container.rest.get(`/applications/${applicationId}/emojis`)) as { items?: ApplicationEmojiData[] };
		applicationEmojis.clear();
		for (const item of response.items ?? []) {
			if (item.name !== null) applicationEmojis.set(item.name, { id: item.id, animated: item.animated === true });
		}
	} catch (error) {
		container.logger.warn('[EMOJIS] Could not read the emojis of the application, the default ones are used:', error);
		return 0;
	}

	const names = Object.values(EmojiDefinitions).map((definition) => definition.name);
	const missing = names.filter((name) => !applicationEmojis.has(name));
	if (missing.length > 0) {
		container.logger.warn(
			`[EMOJIS] The application has no emoji named ${missing.map((name) => `\`${name}\``).join(', ')}, the default ones are used.`
		);
	}

	return names.length - missing.length;
}

/**
 * Gets the emoji of an application, or the one the bot used before when the application has none of that name.
 *
 * @param key - The emoji, a key of {@linkcode EmojiDefinitions}.
 */
function resolveEmoji(key: EmojiKey) {
	const definition: EmojiDefinition = EmojiDefinitions[key];
	const found = applicationEmojis.get(definition.name);
	if (found) return { id: found.id, name: definition.name, animated: found.animated };

	return { id: definition.fallbackId, name: definition.name, animated: definition.animated };
}

/**
 * Writes an emoji of the bot: `Emojis.GreenTick`. They are read when they are used, so they are of the application the
 * emojis were loaded for.
 */
export const Emojis = {} as { readonly [Key in EmojiKey]: string } & { readonly GreenTickSerialized: string };

for (const key of Object.keys(EmojiDefinitions) as EmojiKey[]) {
	Object.defineProperty(Emojis, key, {
		enumerable: true,
		get() {
			const { id, name, animated } = resolveEmoji(key);
			return formatEmoji(name, id, animated);
		}
	});
}

// The form of an emoji a reaction is written with in Redis, `s<id>`:
Object.defineProperty(Emojis, 'GreenTickSerialized', {
	enumerable: true,
	get() {
		return `s${resolveEmoji('GreenTick').id}`;
	}
});
