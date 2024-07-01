import { getRootData } from '@sapphire/pieces';
import { join } from 'node:path';

export const mainFolder = getRootData().root;
export const rootFolder = join(mainFolder, '..');

export const ZeroWidthSpace = '\u200B';
export const LongWidthSpace = '\u3000';

export const EmojiData = {
	MessageAttachmentIcon: { id: '1006096566270033940', name: 'MessageAttachmentIcon', animated: false },
	IntegrationIcon: { id: '1251906194759749653', name: 'IntegrationIcon', animated: false },
	MembersIcon: { id: '1200212636441260103', name: 'MembersIcon', animated: false }
} as const;

export const enum Emojis {
	// ArrowB = '<:ArrowB:694594285269680179>',
	// ArrowBL = '<:ArrowBL:694594285118685259>',
	// ArrowBR = '<:ArrowBR:694594285445578792>',
	// ArrowL = '<:ArrowL:694594285521207436>',
	// ArrowR = '<:ArrowR:694594285466812486>',
	// ArrowT = '<:ArrowT:694594285487652954>',
	// ArrowTL = '<:ArrowTL:694594285625933854>',
	// ArrowTR = '<:ArrowTR:694594285412155393>',
	ArrowLeft = '<:ArrowL:973978245580075069>',
	ArrowRight = '<:ArrowR:973978026536747008>',
	ArrowLeftFast = '<:ArrowFastL:973976973120528484>',
	ArrowRightFast = '<:ArrowFastR:973977208978800640>',
	Stop = '<:Stop:973961000313303060>',
	BoostLevel1 = '<:boostlvl1:935169049523019786>',
	BoostLevel2 = '<:boostlvl2:935169110311063612>',
	BoostLevel3 = '<:boostlvl3:935169145056686101>',
	BoostLevel4 = '<:boostlvl4:935169181362569246>',
	BoostLevel5 = '<:boostlvl5:935170651117998080>',
	BoostLevel6 = '<:boostlvl6:935170683653193788>',
	BoostLevel7 = '<:boostlvl7:935170720365944942>',
	BoostLevel8 = '<:boostlvl8:935170763894439996>',
	BoostLevel9 = '<:boostlvl9:935170794374447184>',
	Bot = '<:bot:764788923851079702>',
	IntegrationIcon = '<:IntegrationIcon:1251906194759749653>',
	Frame = '<:frame:764845055356698644>',
	GreenTick = '<:greenTick:1043562833905987685>',
	GreenTickSerialized = 's1043562833905987685',
	Loading = '<a:sloading:656988867403972629>',
	RedCross = '<:redCross:1043562794336919605>',
	Calendar = '<:calendar_icon:1218607529702068294>',
	Hourglass = '<:hourglass:1226106863574323230>',
	Member = '<:member:1200212636441260103>',
	ShieldMember = '<:shield_member:1218601473664094399>',
	Moderator = '<:moderator:1226106865021095977>',
	AutoModerator = '<:auto_moderator:1226106862147993650>',
	SpammerIcon = '<:spammer:1206893298292232245>',
	QuarantinedIcon = '<:quarantined:1206899526447923210>',
	Reply = '<:reply:1225386830829191188>',
	ReplyInactive = '<:reply_inactive:1225386832146075739>',
	Flag = '<:flag:1225386828152963122>',
	FlagInactive = '<:flag_inactive:1225386829558186028>',
	Timer = '<:timer:985524723490381826>',
	Bucket = '<:bucket:1225500653212930160>',
	Delete = '<:delete:1225386833307766854>',
	DeleteInactive = '<:delete_inactive:1225386834394353675>',
	Timeout = '<:timeout:1225498291131908178>',
	Kick = '<:kick:1225498287092793427>',
	Softban = '<:softban:1225498289131094016>',
	Ban = '<:ban:1225498285637369916>'
}

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

export const enum Invites {
	Skyra = 'https://discord.com/api/oauth2/authorize?client_id=266624760782258186&permissions=292557286486&scope=bot%20applications.commands',
	Dragonite = 'https://discord.com/api/oauth2/authorize?client_id=931264626614763530&permissions=81920&scope=bot%20applications.commands',
	Iriss = 'https://discord.com/api/oauth2/authorize?client_id=948377113457745990&permissions=326417868864&scope=bot%20applications.commands',
	Nekokai = 'https://discord.com/api/oauth2/authorize?client_id=939613684592934992&permissions=16384&scope=bot%20applications.commands',
	Teryl = 'https://discord.com/api/oauth2/authorize?client_id=948377583626637343&permissions=1074004032&scope=applications.commands%20bot',
	Artiel = 'https://discord.com/api/oauth2/authorize?client_id=948377028028145755&permissions=51200&scope=applications.commands%20bot'
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
