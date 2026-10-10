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
