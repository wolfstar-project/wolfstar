import type { GuildMessage } from '#lib/types';
import { getTag } from '#utils/util';
import type { Attachment, Embed, Guild, User } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { APIEmbedField } from 'discord-api-types/v10';
import { cleanMentions } from './util';

type EmbedAsset = NonNullable<Embed['image']>;
type EmbedFooter = NonNullable<Embed['footer']>;
type EmbedAuthor = NonNullable<Embed['author']>;

export async function formatMessage(t: TFunction<AnyNamespace>, message: GuildMessage): Promise<string> {
	const header = formatHeader(t, message);
	const content = await formatContents(message);
	return `${header}\n${content}`;
}

function formatHeader(t: TFunction<AnyNamespace>, message: GuildMessage): string {
	return `${formatTimestamp(t, message.createdTimestamp)} ${message.system ? 'SYSTEM' : formatAuthor(message.author)}`;
}

/**
 * Formats a timestamp using {@link Intl}
 *
 * This **cannot** make use of Discord's timestamp formatting as the result
 * of this function is placed inside of a codeblock.
 */
export function formatTimestamp(t: TFunction<AnyNamespace>, timestamp: number): string {
	return `[${(t as unknown as (key: string, options: object) => string)('globals:humanDateTimeValue', { value: timestamp })}]`;
}

function formatAuthor(author: User): string {
	return `${getTag(author)}${author.bot ? ' [BOT]' : ''}`;
}

async function formatContents(message: GuildMessage): Promise<string> {
	const output: string[] = [];
	const guild = await message.fetchGuild();
	if (guild === null) throw new TypeError('The guild of the message could not be resolved.');
	if (message.content.length > 0) output.push(await formatContent(guild, message.content));
	if (message.embeds.length > 0) output.push((await Promise.all(message.embeds.map((embed) => formatEmbed(guild, embed)))).join('\n'));
	if (message.attachments.size > 0) output.push([...message.attachments.values()].map((attachment) => formatAttachment(attachment)).join('\n'));
	return output.join('\n');
}

async function formatContent(guild: Guild, content: string): Promise<string> {
	return (await cleanMentions(guild, content))
		.split('\n')
		.map((line) => `> ${line}`)
		.join('\n');
}

export function formatAttachment(attachment: Attachment): string {
	return `📂 [${attachment.name}: ${attachment.url}]`;
}

async function formatEmbed(guild: Guild, embed: Embed): Promise<string> {
	if (embed.provider === null) {
		const output: string[] = [];
		if (embed.title) output.push(formatEmbedRichTitle(embed.title));
		if (embed.author) output.push(formatEmbedRichAuthor(embed.author));
		if (embed.url) output.push(formatEmbedRichUrl(embed.url));
		if (embed.description) output.push(await formatEmbedRichDescription(guild, embed.description));
		if (embed.fields.length > 0) output.push((await Promise.all(embed.fields.map((field) => formatEmbedRichField(guild, field)))).join('\n'));
		if (embed.image) output.push(formatEmbedRichImage(embed.image));
		if (embed.footer) output.push(formatEmbedRichFooter(embed.footer));
		return output.join('\n');
	}

	return formatEmbedRichProvider(embed);
}

function formatEmbedRichTitle(title: string): string {
	return `># ${title}`;
}

function formatEmbedRichUrl(url: string): string {
	return `> 📎 ${url}`;
}

function formatEmbedRichAuthor(author: EmbedAuthor): string {
	return `> 👤 ${author.iconURL ? `[${author.iconURL}] ` : ''}${author.name || '-'}${author.url ? ` <${author.url}>` : ''}`;
}

async function formatEmbedRichDescription(guild: Guild, description: string): Promise<string> {
	return (await cleanMentions(guild, description))
		.split('\n')
		.map((line) => `> > ${line}`)
		.join('\n');
}

async function formatEmbedRichField(guild: Guild, field: APIEmbedField): Promise<string> {
	return `> #> ${field.name}\n${(await cleanMentions(guild, field.value))
		.split('\n')
		.map((line) => `>  > ${line}`)
		.join('\n')}`;
}

function formatEmbedRichImage(image: EmbedAsset): string {
	return `>🖼️ [${image.url}]`;
}

function formatEmbedRichFooter(footer: EmbedFooter): string {
	return `>_ ${footer.iconURL ? `[${footer.iconURL}]${footer.text ? ' - ' : ''}` : ''}${footer.text ?? ''}`;
}

function formatEmbedRichProvider(embed: Embed): string {
	return `🔖 [${embed.url}]${embed.provider ? ` (${embed.provider.name}).` : ''}`;
}
