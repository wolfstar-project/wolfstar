/**
 * An operation of the patch {@link auditDiff} computes, a subset of JSON Patch (RFC 6902).
 */
export type AuditPatchOperation =
	| { op: 'add'; path: string; value: unknown }
	| { op: 'remove'; path: string }
	| { op: 'replace'; path: string; value: unknown };

/**
 * Computes the patch that turns `before` into `after`.
 *
 * @remarks
 *
 * A local stand-in for `auditDiff` from `evlog`, which the original bot used and is not a dependency here. Objects are
 * compared key by key, recursively, and every other value (arrays included) is replaced as a whole when it changes. The
 * paths are `/`-separated, without the JSON Pointer escapes, since the keys of the settings never hold a `/` or a `~`.
 *
 * @param before The values before the change.
 * @param after The values after the change.
 */
export function auditDiff(before: Record<string, unknown>, after: Record<string, unknown>): { patch: AuditPatchOperation[] } {
	const patch: AuditPatchOperation[] = [];
	diffObjects(before, after, '', patch);
	return { patch };
}

function diffObjects(before: Record<string, unknown>, after: Record<string, unknown>, parent: string, patch: AuditPatchOperation[]) {
	for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
		const path = `${parent}/${key}`;

		if (!Object.hasOwn(before, key)) {
			patch.push({ op: 'add', path, value: after[key] });
		} else if (!Object.hasOwn(after, key)) {
			patch.push({ op: 'remove', path });
		} else {
			const previous = before[key];
			const next = after[key];

			if (isPlainObject(previous) && isPlainObject(next)) diffObjects(previous, next, path, patch);
			else if (!isDeepEqual(previous, next)) patch.push({ op: 'replace', path, value: next });
		}
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDeepEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;

	if (Array.isArray(left)) {
		return Array.isArray(right) && left.length === right.length && left.every((value, index) => isDeepEqual(value, right[index]));
	}

	if (isPlainObject(left) && isPlainObject(right)) {
		const keys = Object.keys(left);
		return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && isDeepEqual(left[key], right[key]));
	}

	return false;
}
