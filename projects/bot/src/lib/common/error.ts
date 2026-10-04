import { DiscordAPIError, HTTPError } from '@discordjs/rest';
import { ResultError } from '@sapphire/result';
import { UserError } from '@wolfstar/http-framework';
import type { AnyNamespace, TFunction as BaseTFunction } from '@wolfstar/plugin-i18next';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';
import { exists } from 'i18next';

type TFunction = BaseTFunction<AnyNamespace>;

/** Translates a key that is only known at runtime, hence not part of the typed resources. */
function translateDynamic(t: TFunction, key: string, options?: unknown): string {
	return String((t as unknown as (key: string, options?: unknown) => unknown)(key, options));
}

export function stringifyError(t: TFunction, error: unknown): string {
	switch (typeof error) {
		case 'string':
			return stringifyErrorString(t, error);
		case 'number':
		case 'bigint':
		case 'boolean':
		case 'undefined':
		case 'symbol':
		case 'function':
			return String(error);
		case 'object':
			return stringifyErrorObject(t, error);
	}
}

function stringifyErrorString(t: TFunction, error: string): string {
	return exists(error) ? translateDynamic(t, error) : error;
}

function stringifyErrorObject(t: TFunction, error: object | null): string {
	return error instanceof Error ? stringifyErrorException(t, error) : String(error);
}

const isSuppressedError =
	typeof SuppressedError === 'undefined'
		? (error: Error): error is SuppressedError => 'error' in error && 'suppressed' in error
		: (error: Error): error is SuppressedError => error instanceof SuppressedError;

function stringifyErrorException(t: TFunction, error: Error): string {
	if (error.name === 'AbortError') return t('system:discordAbortError');
	if (error instanceof UserError) return translateDynamic(t, error.identifier, error.context);
	if (error instanceof ResultError) return stringifyError(t, error.value);
	if (error instanceof DiscordAPIError) return stringifyDiscordAPIError(t, error);
	if (error instanceof HTTPError) return stringifyHTTPError(t, error);
	if (error instanceof AggregateError) return error.errors.map((value) => stringifyError(t, value)).join('\n');
	if (isSuppressedError(error)) return stringifyError(t, error.suppressed);
	return error.message;
}

function stringifyDiscordAPIError(t: TFunction, error: DiscordAPIError) {
	switch (error.code) {
		case RESTJSONErrorCodes.UnknownChannel:
			return t('errors:genericUnknownChannel');
		case RESTJSONErrorCodes.UnknownGuild:
			return t('errors:genericUnknownGuild');
		case RESTJSONErrorCodes.UnknownMember:
			return t('errors:genericUnknownMember');
		case RESTJSONErrorCodes.UnknownMessage:
			return t('errors:genericUnknownMessage');
		case RESTJSONErrorCodes.UnknownRole:
			return t('errors:genericUnknownRole');
		case RESTJSONErrorCodes.MissingAccess:
			return t('errors:genericMissingAccess');
		default:
			return error.message;
	}
}

function stringifyHTTPError(t: TFunction, error: HTTPError) {
	switch (error.status) {
		case 500:
			return t('errors:genericDiscordInternalServerError');
		case 502:
		case 504:
			return t('errors:genericDiscordGateway');
		case 503:
			return t('errors:genericDiscordUnavailable');
		default:
			return error.message;
	}
}
