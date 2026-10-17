/**
 * Whether a text can be the ID of a row of a table whose key is generated, a positive `bigint`: what is not one is
 * never the ID of a row, and the database would refuse to read it as a number.
 *
 * @param id - The text to check, such as the ID of an auto-moderation rule or of a report.
 */
export function isRowId(id: string): boolean {
	return /^\d{1,18}$/.test(id);
}
