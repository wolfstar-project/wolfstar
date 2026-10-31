import { SettingsImportFileInputId, SettingsImportTextInputId } from '#lib/structures/settings-menu/render';
import { getModalValue, getModalValues } from 'wolfstar-shared';
import type { APIAttachment, APIModalSubmission } from 'discord-api-types/v10';

/**
 * What the modal of the import brought: the file that was attached, or the text that was pasted.
 */
export type SettingsImportSubmission = { type: 'file'; attachment: APIAttachment } | { type: 'text'; text: string };

/**
 * Reads what was submitted in the modal of the import, see `renderSettingsImportModal`.
 *
 * @remarks A file that was attached wins over what was pasted. The file is read from the resolved attachments of the
 * submission, which is where Discord puts what the ID of the file upload points to.
 *
 * @param data - The data of the submission of the modal.
 * @returns What to import, `null` when nothing was attached nor pasted.
 */
export function readSettingsImportSubmission(data: Pick<APIModalSubmission, 'components' | 'resolved'>): SettingsImportSubmission | null {
	const [attachmentId] = getModalValues(data.components, SettingsImportFileInputId);
	const attachment = attachmentId === undefined ? undefined : data.resolved?.attachments?.[attachmentId];
	if (attachment !== undefined) return { type: 'file', attachment };

	const text = getModalValue(data.components, SettingsImportTextInputId)?.trim() ?? '';
	return text === '' ? null : { type: 'text', text };
}
