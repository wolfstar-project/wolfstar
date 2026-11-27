import { fetchCaseProofFile } from '#lib/moderation/caseEdits';
import type { CaseViewDetails } from '#lib/structures/case-menu/view';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { fetchModerationCaseData } from 'wolfstar-database';

/**
 * Reads what the moderators added to a case, to show it with the case: their note, and the proof with its file.
 *
 * @param guildId - The guild of the case.
 * @param caseId - The ID of the case.
 */
export async function fetchCaseViewDetails(guildId: Snowflake, caseId: number): Promise<CaseViewDetails> {
	const stored = await fetchModerationCaseData(container.prisma.orm, guildId, caseId);
	const proof = stored?.proof ?? null;
	return { staffNote: stored?.staffNote ?? null, proof, proofFile: proof === null ? null : await fetchCaseProofFile(proof) };
}
