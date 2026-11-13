import { bgBlue, bgRed } from 'colorette';

/**
 * Anything identifying a piece of the framework: the piece itself, or a plain label.
 */
export type PieceLike = string | { readonly name: string; readonly store: { readonly name: string } };

export function getLogPrefix(piece: PieceLike) {
	return bgBlue(typeof piece === 'string' ? `[ ${piece} ]` : `[ ${piece.store.name} => ${piece.name} ]`);
}

export function getCodeStyle(code: string | number) {
	return bgRed(`[ ${code} ]`);
}
