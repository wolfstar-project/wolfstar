import type { LegacyRow } from '../../src/legacy/types.js';
import legacyColumns from './guilds-columns.json' with { type: 'json' };

const Defaults: LegacyRow = {
	id: '254360814063058944',
	prefix: 'w!',
	language: 'en-US',
	'selfmod.capitals.minimum': 15,
	'selfmod.capitals.maximum': 50,
	'selfmod.newlines.maximum': 20,
	'selfmod.messages.maximum': 5,
	'selfmod.messages.queue-size': 50,
	'no-mention-spam.mentions-allowed': 20,
	'no-mention-spam.time-period': 8,
	'messages.moderation-reason-display': true,
	'messages.moderation-message-display': true,
	'messages.moderator-name-display': true
};

/**
 * A row of `guilds` with the defaults of its columns, as `to_jsonb` reads it.
 */
export function createLegacyGuild(overrides: LegacyRow = {}): LegacyRow {
	const row: LegacyRow = {};
	for (const column of legacyColumns) {
		if (column.endsWith('.threshold-maximum')) row[column] = 10;
		else if (column.endsWith('.threshold-duration')) row[column] = 60_000;
		else if (column.endsWith('.soft-action') || column.endsWith('.hard-action')) row[column] = 0;
		else if (column.endsWith('.enabled') || column.startsWith('events.') || column === 'no-mention-spam.alerts') row[column] = false;
		else if (
			/ignored|ignore\.|raw$|allowed$|blocked$|disabled-c|media-only|roles\.(admin|moderator|public)|sticky|reaction-roles|unique|permissions|command-auto/.test(
				column
			)
		)
			row[column] = [];
		else row[column] = null;
	}

	return { ...row, ...Defaults, ...overrides };
}
