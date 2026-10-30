import { encodeModerationRecordMetadata, getModerationRecordAction } from '#lib/moderation/managers/ModerationRecord';
import type { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { isWorker } from '#utils/worker';
import { container } from '@wolfstar/http-framework';
import pg from 'pg';
import { migrateLegacyDatabase } from 'wolfstar-database';

function encodeCase(type: number, metadata: number) {
	return {
		action: getModerationRecordAction(type as TypeVariation, metadata as TypeMetadata),
		metadata: encodeModerationRecordMetadata(type as TypeVariation, metadata as TypeMetadata)
	};
}

/**
 * Converts the legacy tables of the database, or of a backup restored into it, into the new schema, on the process that
 * is the only one of its kind: the gateway, or the shard manager with the sharder. It never keeps the bot from starting:
 * what it could not do is logged and tried again at the next start.
 */
export async function runLegacyMigration(): Promise<void> {
	if (isWorker()) return;

	const { logger } = container;
	const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
	try {
		await client.connect();
		await migrateLegacyDatabase({
			client,
			encodeCase,
			log: {
				info: (message) => logger.info(message),
				warn: (message) => logger.warn(message),
				error: (message, error) => logger.error(message, error)
			}
		});
	} catch (error) {
		logger.error('[LEGACY] The conversion could not run', error);
	} finally {
		await client.end().catch(() => null);
	}
}
