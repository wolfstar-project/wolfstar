import { PhishingHostnames } from '#utils/Links/PhishingHostnames';
import { container } from '@wolfstar/http-framework';

/**
 * The list of the hostnames that are known to steal accounts, kept by the Discord-AntiScam community. The bot starts
 * with the copy `scripts/phishing.mjs` writes (`PhishingHostnames`), and reads this one for what was added since.
 */
const PhishingListUrl = 'https://raw.githubusercontent.com/Discord-AntiScam/scam-links/main/list.json';

/** How long a list is used before it is read again, and how long a failed read waits before the next one. */
const RefreshInterval = 60 * 60 * 1000;
const RetryInterval = 5 * 60 * 1000;
const FetchTimeout = 15_000;

let hostnames: ReadonlySet<string> = new Set(PhishingHostnames);
let nextRefresh = 0;
let refreshing: Promise<void> | null = null;

/**
 * Reads a hostname as the list writes it: lowercase, without the `www.` and without the dot of a full name.
 */
export function normalizeHostname(hostname: string) {
	const lowered = hostname.toLowerCase().replace(/\.$/, '');
	return lowered.startsWith('www.') ? lowered.slice(4) : lowered;
}

/**
 * Whether a hostname, or a domain it is under, is in a list of hostnames: `login.example.com` is under `example.com`.
 * A top-level domain alone is never looked up.
 *
 * @param list - The hostnames, lowercase.
 * @param hostname - The hostname of a link.
 */
export function isListedHostname(list: ReadonlySet<string>, hostname: string) {
	const labels = normalizeHostname(hostname).split('.');
	for (let index = 0; index < labels.length - 1; index++) {
		if (list.has(labels.slice(index).join('.'))) return true;
	}

	return false;
}

/**
 * Reads the hostnames of a list from data that is not trusted, the body of the response.
 */
export function parsePhishingList(data: unknown): Set<string> {
	if (!Array.isArray(data)) throw new TypeError('The list of phishing links is not an array.');
	return new Set(data.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0).map((entry) => normalizeHostname(entry)));
}

/**
 * The hostnames that are known to steal accounts. The list is read again the first time it is asked for and once an
 * hour after, in the background: a message is never held back by it, and a read that fails keeps the last list.
 */
export function getPhishingHostnames(): ReadonlySet<string> {
	if (Date.now() >= nextRefresh) refreshing ??= refresh();
	return hostnames;
}

async function refresh() {
	try {
		const response = await fetch(PhishingListUrl, { signal: AbortSignal.timeout(FetchTimeout) });
		if (!response.ok) throw new Error(`The list of phishing links answered ${response.status}.`);

		const data = await response.json();
		hostnames = parsePhishingList(data);
		nextRefresh = Date.now() + RefreshInterval;
	} catch (error) {
		nextRefresh = Date.now() + RetryInterval;
		container.logger.error('[AUTOMOD] Could not read the list of phishing links:', error);
	} finally {
		refreshing = null;
	}
}
