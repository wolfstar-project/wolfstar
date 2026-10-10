import { remove as removeConfusables } from 'confusables';
import { isMainThread, parentPort } from 'node:worker_threads';

// This module is ran by `WorkerHandler` in a `worker_threads` worker, directly from the sources (type stripping) or from
// the build output, therefore it cannot import any module that is not plain JavaScript once its types are stripped: the
// enumerations of `types.ts` are duplicated as plain objects and its types are imported with `import type`.
import type { IncomingPayload, IncomingRunRegExpPayload, OutgoingPayload, OutgoingRegExpMatchPayload } from './types.js';

if (isMainThread || parentPort === null) throw new Error('The Worker may only be ran via the worker_threads fork method!');

const IncomingType = {
	RunRegExp: 0
} as const satisfies Record<string, IncomingPayload['type']>;

const OutgoingType = {
	Heartbeat: 0,
	UnknownCommand: 1,
	NoContent: 2,
	RegExpMatch: 3
} as const satisfies Record<string, OutgoingPayload['type']>;

function post(message: OutgoingPayload) {
	return parentPort!.postMessage(message);
}

post({ type: OutgoingType.Heartbeat });

setInterval(() => post({ type: OutgoingType.Heartbeat }), 45000).unref();

parentPort.on('message', (message: IncomingPayload) => post(handleMessage(message)));

function handleMessage(message: IncomingPayload): OutgoingPayload {
	switch (message.type) {
		case IncomingType.RunRegExp:
			return handleRunRegExp(message);
		default:
			return { id: (message as IncomingPayload).id, type: OutgoingType.UnknownCommand };
	}
}

/**
 * Handles running a regular expression filter on a message's content after removing confusables.
 *
 * @param message - The message object to filter.
 * @returns The filtered message content, if any.
 */
function handleRunRegExp(message: IncomingRunRegExpPayload): OutgoingPayload {
	// Remove confusables and run filter:
	const result = filter(removeConfusables(message.content), message.regExp);
	if (result === null) return { id: message.id, type: OutgoingType.NoContent };

	// Post the results:
	return { id: message.id, type: OutgoingType.RegExpMatch, filtered: result.filtered, highlighted: result.highlighted };
}

type RegExpMatchResult = Pick<OutgoingRegExpMatchPayload, 'filtered' | 'highlighted'>;

/**
 * Filters a string based on a regular expression, replacing matching sections with asterisks and returning both the
 * filtered and highlighted versions.
 *
 * @param str - The string to filter.
 * @param regex - The regular expression to match against.
 */
function filter(str: string, regex: RegExp): RegExpMatchResult | null {
	const matches = str.match(regex);
	if (matches === null) return null;

	let last = 0;
	let next = 0;

	const filtered: string[] = [];
	const highlighted: string[] = [];
	for (const match of matches) {
		next = str.indexOf(match, last);
		const section = str.slice(last, next);
		if (section) {
			filtered.push(section, '*'.repeat(match.length));
			highlighted.push(section, `__${match}__`);
		} else {
			filtered.push('*'.repeat(match.length));
			highlighted.push(`__${match}__`);
		}
		last = next + match.length;
	}

	if (last !== str.length) {
		const end = str.slice(last);
		filtered.push(end);
		highlighted.push(end);
	}

	return {
		filtered: filtered.join(''),
		highlighted: highlighted.join('')
	};
}
