import { DiscordAPIError } from '@discordjs/rest';
import { err, ok, type Result } from '@sapphire/result';
import { isThenable, type Awaitable } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { RESTJSONErrorCodes } from 'discord-api-types/v10';
import { setTimeout as sleep } from 'node:timers/promises';

export async function resolveOnErrorCodes<T>(promise: Promise<T>, ...codes: readonly RESTJSONErrorCodes[]) {
	try {
		return await promise;
	} catch (error) {
		if (error instanceof DiscordAPIError && codes.includes(error.code as RESTJSONErrorCodes)) return null;
		throw error;
	}
}

export async function toErrorCodeResult<T>(promise: Promise<T>): Promise<Result<T, RESTJSONErrorCodes>> {
	try {
		return ok(await promise);
	} catch (error) {
		if (error instanceof DiscordAPIError) return err(error.code as RESTJSONErrorCodes);
		throw error;
	}
}

export function floatPromise(promise: Awaitable<unknown>) {
	if (isThenable(promise)) promise.catch((error: Error) => container.logger.fatal(error));
}

export interface ReferredPromise<T> {
	promise: Promise<T>;
	resolve(value?: T): void;
	reject(error?: Error): void;
}

/**
 * Create a referred promise.
 */
export function createReferPromise<T>(): ReferredPromise<T> {
	let resolve: (value: T) => void;
	let reject: (error?: Error) => void;
	const promise: Promise<T> = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve: resolve!, reject: reject! };
}

/**
 * Runs a function again when it throws, a delay after each failure: it is tried once more than there are delays.
 *
 * @param run - The function to run, which is given the attempt it is, from 1.
 * @param delays - How long to wait after each failure, in milliseconds.
 * @throws The error of the last attempt.
 */
export async function retryWithDelays<T>(run: (attempt: number) => Awaitable<T>, delays: readonly number[]): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await run(attempt);
		} catch (error) {
			const delay = delays[attempt - 1];
			if (delay === undefined) throw error;

			await sleep(delay);
		}
	}
}
