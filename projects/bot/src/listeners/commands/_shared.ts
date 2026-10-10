import { translate } from '#lib/i18n/translate';
import { translateKey, type TranslationKey } from '#lib/structures/commands/utils';
import { OWNERS } from '#root/config';
import { getCodeStyle, getLogPrefix } from '#utils/functions';
import { codeBlock } from '@discordjs/builders';
import { DiscordAPIError, HTTPError } from '@discordjs/rest';
import { ResultError } from '@sapphire/result';
import { cutText, isObject } from '@sapphire/utilities';
import { captureException, lastEventId } from '@sentry/node';
import { ArgumentError, UserError, container } from '@wolfstar/http-framework';
import type { Command } from '@wolfstar/http-framework';
import type { TFunction } from '@wolfstar/plugin-i18next';
import { isSentryInitialized } from '@wolfstar/shared-http-pieces';
import { RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import { exists } from 'i18next';

export function resolveError(t: TFunction, error: UserError | string) {
	return typeof error === 'string' ? resolveStringError(t, error) : resolveUserError(t, error);
}

function resolveStringError(t: TFunction, error: string) {
	return exists(error) ? translateKey(t, error as TranslationKey) : error;
}

function resolveUserError(t: TFunction, error: UserError) {
	const identifier = translate(error.identifier) as TranslationKey;
	return translateKey(
		t,
		identifier,
		error instanceof ArgumentError
			? {
					...error,
					...(error.context as object),
					argument: error.argument,
					parameter: cutText(String(error.parameter).replaceAll('`', '῾'), 50)
				}
			: (error.context as Record<string, unknown> | undefined)
	);
}

export function flattenError(command: Command, error: unknown): UserError | string | null {
	if (typeof error === 'string') return error;

	if (!(error instanceof Error)) {
		container.logger.fatal(getLogPrefix(command), 'Unknown unhandled error:', error);
		return null;
	}

	if (error instanceof ResultError) return flattenError(command, error.value);
	if (error instanceof UserError) return error;

	if (error instanceof DiscordAPIError) {
		container.logger.error(getLogPrefix(command), getCodeStyle(error.code.toString()), 'Unhandled error:', error);
		return getDiscordError(error.code as number);
	}

	if (error instanceof HTTPError) {
		container.logger.error(getLogPrefix(command), getCodeStyle(error.status.toString()), 'Unhandled error:', error);
		return getHttpError(error.status);
	}

	if (error.name === 'AbortError') {
		return 'system:discordAbortError';
	}

	container.logger.fatal(getLogPrefix(command), error);
	return null;
}

export function generateUnexpectedErrorMessage(userId: Snowflake, command: Command, t: TFunction, error: unknown) {
	if (OWNERS.includes(userId)) return codeBlock('js', String(error));
	if (!isSentryInitialized()) return translateKey(t, 'events/errors:unexpectedError');

	try {
		const report = reportError(command, error);
		return translateKey(t, 'events/errors:unexpectedErrorWithContext', { report });
	} catch {
		return translateKey(t, 'events/errors:unexpectedError');
	}
}

/**
 * Reports an error to Sentry, and returns the ID of its event.
 *
 * @remarks
 *
 * `@wolfstar/shared-http-pieces` reports every `commandError` too. Sentry captures an exception once, and capturing it
 * again returns an ID no event has, so the ID of the event its listener sent is read instead when it ran first.
 */
function reportError(command: Command, error: unknown) {
	if (isObject(error) && Reflect.get(error, '__sentry_captured__') === true) return lastEventId();
	return captureException(error, { tags: { command: command.name } });
}

function getDiscordError(code: RESTJSONErrorCodes) {
	switch (code) {
		case RESTJSONErrorCodes.UnknownChannel:
			return 'errors:genericUnknownChannel';
		case RESTJSONErrorCodes.UnknownGuild:
			return 'errors:genericUnknownGuild';
		case RESTJSONErrorCodes.UnknownMember:
			return 'errors:genericUnknownMember';
		case RESTJSONErrorCodes.UnknownMessage:
			return 'errors:genericUnknownMessage';
		case RESTJSONErrorCodes.UnknownRole:
			return 'errors:genericUnknownRole';
		case RESTJSONErrorCodes.MissingAccess:
			return 'errors:genericMissingAccess';
		default:
			return null;
	}
}

function getHttpError(status: number) {
	switch (status) {
		case 500:
			return 'errors:genericDiscordInternalServerError';
		case 502:
		case 504:
			return 'errors:genericDiscordGateway';
		case 503:
			return 'errors:genericDiscordUnavailable';
		default:
			return null;
	}
}
