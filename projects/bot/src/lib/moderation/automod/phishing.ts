import { PhishingHostnames } from '#utils/Links/PhishingHostnames';

/**
 * The hostnames that are known to steal accounts, the list kept by the Discord-AntiScam community. It is the copy
 * `scripts/phishing.mjs` writes (`PhishingHostnames`), as `TLDs` is: the bot never downloads it.
 */
const hostnames: ReadonlySet<string> = new Set(PhishingHostnames);

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
 * The hostnames that are known to steal accounts.
 */
export function getPhishingHostnames(): ReadonlySet<string> {
	return hostnames;
}
