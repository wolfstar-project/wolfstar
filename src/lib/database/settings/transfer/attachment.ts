import { MaximumConfigurationFileSize } from './format';

export async function downloadConfigurationFile(attachment: { url: string; size: number }): Promise<string | null> {
	if (attachment.size > MaximumConfigurationFileSize) return null;
	let url: URL;
	try {
		url = new URL(attachment.url);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) return null;
	// No redirects: only Discord attachment hosts may be contacted.
	const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
	if (!response.ok || !response.body) return null;
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			size += chunk.value.byteLength;
			if (size > MaximumConfigurationFileSize) {
				await reader.cancel();
				return null;
			}
			chunks.push(chunk.value);
		}
	} finally {
		reader.releaseLock();
	}
	return Buffer.concat(chunks).toString('utf8');
}
