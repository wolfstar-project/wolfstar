/**
 * Finds the value of a text input of a submitted modal, which Discord nests in rows or labels.
 *
 * @param components - The components of the submitted modal.
 * @param customId - The custom ID of the text input.
 * @returns The text that was written, or `null` when the modal has no such input.
 */
export function getModalValue(components: readonly unknown[], customId: string): string | null {
	for (const component of components) {
		if (typeof component !== 'object' || component === null) continue;

		const entry = component as { custom_id?: string; value?: string; components?: readonly unknown[]; component?: unknown };
		if (entry.custom_id === customId && typeof entry.value === 'string') return entry.value;

		const nested = getModalValue([...(entry.components ?? []), ...(entry.component === undefined ? [] : [entry.component])], customId);
		if (nested !== null) return nested;
	}

	return null;
}

/**
 * Finds what was picked in a select menu of a submitted modal, which Discord nests in a label.
 *
 * @param components - The components of the submitted modal.
 * @param customId - The custom ID of the select menu.
 * @returns What was picked, empty when nothing was or when the modal has no such select menu.
 */
export function getModalValues(components: readonly unknown[], customId: string): string[] {
	for (const component of components) {
		if (typeof component !== 'object' || component === null) continue;

		const entry = component as { custom_id?: string; values?: unknown; components?: readonly unknown[]; component?: unknown };
		if (entry.custom_id === customId) {
			return Array.isArray(entry.values) ? entry.values.filter((value): value is string => typeof value === 'string') : [];
		}

		const nested = getModalValues([...(entry.components ?? []), ...(entry.component === undefined ? [] : [entry.component])], customId);
		if (nested.length > 0) return nested;
	}

	return [];
}
