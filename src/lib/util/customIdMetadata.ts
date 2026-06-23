import { LanguageKeys } from '#lib/i18n/languageKeys';
import { Result, UserError, container } from '@sapphire/framework';
import { deserialize, serialize } from 'binarytf';
import type { Interaction } from 'discord.js';
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';

/**
 * Compresses customId metadata using a combination of {@link serialize}
 * from `binarytf` and then compressing it with {@link brotliCompressSync} from `node:zlib`.
 * @param params The data to serialize and compress
 * @returns A stringified version of the data using `binary` encoding
 */
export function compressCustomIdMetadata<T>(params: T, customMessagePart?: string): string {
	const serializedId = brotliCompressSync(serialize(params)).toString('binary');

	if (serializedId.length > 80) {
		throw new UserError({
			identifier: LanguageKeys.Errors.QueryCausedTooLongCustomId,
			context: { customMessagePart: customMessagePart ?? '' }
		});
	}

	return serializedId;
}

export function decompressCustomIdMetadata<T>(content: string, interaction?: Interaction): T {
	const result = Result.from<T, Error>(() => deserialize<T>(brotliDecompressSync(Buffer.from(content, 'binary'))));

	return result.match({
		ok: (data) => data,
		err: (error) => {
			container.client.emit('error', error, interaction);

			throw new UserError({
				identifier: LanguageKeys.Errors.SettingsMenuCustomIdDeserializeFailed
			});
		}
	});
}
