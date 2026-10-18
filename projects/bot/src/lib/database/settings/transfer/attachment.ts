import { MaximumConfigurationFileSize } from '#lib/database/settings/transfer/format';
import type { APIAttachment } from 'discord-api-types/v10';

/**
 * The hosts Discord serves the attachments of an interaction from.
 */
const AttachmentHosts = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

/**
 * Reads the file a user attached to an import.
 *
 * @remarks The size Discord reports is checked before anything is downloaded, and the body is checked again since a
 * download is not bound by it. The URL comes from the interaction, which is signed by Discord, but it is only followed
 * when it is one of the hosts of its attachments.
 *
 * @param attachment - The file attached to the modal of the import.
 * @returns The content of the file, `null` when it cannot be read or it is too large.
 */
export async function downloadConfigurationFile(attachment: Pick<APIAttachment, 'url' | 'size'>): Promise<string | null> {
	if (attachment.size > MaximumConfigurationFileSize) return null;

	let url: URL;
	try {
		url = new URL(attachment.url);
	} catch {
		return null;
	}

	if (url.protocol !== 'https:' || !AttachmentHosts.has(url.hostname)) return null;

	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
		if (!response.ok) return null;

		const buffer = await response.arrayBuffer();
		if (buffer.byteLength > MaximumConfigurationFileSize) return null;

		// An editor may put a byte order mark in front of the JSON:
		return new TextDecoder('utf-8').decode(buffer).replace(/^﻿/, '');
	} catch {
		return null;
	}
}
