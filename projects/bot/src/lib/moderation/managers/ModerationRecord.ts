import { parseTimestamp, type ModerationData } from 'wolfstar-database';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';

/**
 * The name of the action stored in the `ModerationAction` table.
 */
export type ModerationRecordAction = ModerationData['action'];

/**
 * A row of the `ModerationAction` table, without its relations.
 */
export type ModerationRow = Omit<ModerationData, 'guild'>;

/**
 * The moderation case, as it is stored in the `ModerationAction` table.
 *
 * @remarks
 *
 * The table does not have a column for the type of the case, its image or its
 * extra data, and it only has an enum for the action that was taken. To not
 * lose the information that can be stored, the record is encoded this way:
 *
 * - `id` is the case ID, `targetId` is the user and `moderatorId` the moderator.
 * - `action` is the closest action to the type of the case, and it is the source
 *   of truth only for the records that were not written by this encoder.
 * - `metadata` contains the {@linkcode TypeMetadata} in its first 8 bits, the
 *   {@linkcode TypeVariation} in the next 8 bits, and a marker bit
 *   ({@linkcode TypeEncodedMarker}) that tells that the type is encoded.
 * - `duration` is stored in seconds, `0` when the case is not temporary.
 *
 * `messageReference` and `extraData` are stored apart, in `ModerationCaseData`, by
 * the {@linkcode ModerationManager}.
 */
export interface ModerationRecord {
	id: number;
	createdAt: number;
	duration: number | null;
	guildId: string;
	moderatorId: string;
	userId: string;
	reason: string | null;
	type: TypeVariation;
	metadata: TypeMetadata;
}

const MetadataMask = 0xff;
const TypeShift = 8;
const TypeMask = 0xff << TypeShift;
/**
 * Set when the type of the case is encoded in the metadata of the record.
 */
const TypeEncodedMarker = 1 << 16;

const ActionToType = {
	AddRole: [TypeVariation.RoleAdd, TypeMetadata.None],
	RemoveRole: [TypeVariation.RoleRemove, TypeMetadata.None],
	Nickname: [TypeVariation.SetNickname, TypeMetadata.None],
	AddWarning: [TypeVariation.Warning, TypeMetadata.None],
	RemoveWarning: [TypeVariation.Warning, TypeMetadata.Undo],
	Timeout: [TypeVariation.Timeout, TypeMetadata.None],
	TimeoutEnd: [TypeVariation.Timeout, TypeMetadata.Undo],
	Kick: [TypeVariation.Kick, TypeMetadata.None],
	Softban: [TypeVariation.Softban, TypeMetadata.None],
	Ban: [TypeVariation.Ban, TypeMetadata.None],
	Unban: [TypeVariation.Ban, TypeMetadata.Undo]
} as const satisfies Readonly<Record<ModerationRecordAction, readonly [TypeVariation, TypeMetadata]>>;

/**
 * The actions for the types that do not have an equivalent in the table, they
 * are the closest action in the effect: the roles are added, the member is
 * timed out or removed from a voice channel.
 */
const TypeToAction = {
	[TypeVariation.Ban]: ['Ban', 'Unban'],
	[TypeVariation.Kick]: ['Kick', 'Kick'],
	[TypeVariation.Mute]: ['AddRole', 'RemoveRole'],
	[TypeVariation.Softban]: ['Softban', 'Softban'],
	[TypeVariation.VoiceKick]: ['Kick', 'Kick'],
	[TypeVariation.VoiceMute]: ['Timeout', 'TimeoutEnd'],
	[TypeVariation.Warning]: ['AddWarning', 'RemoveWarning'],
	[TypeVariation.RestrictedReaction]: ['AddRole', 'RemoveRole'],
	[TypeVariation.RestrictedEmbed]: ['AddRole', 'RemoveRole'],
	[TypeVariation.RestrictedAttachment]: ['AddRole', 'RemoveRole'],
	[TypeVariation.RestrictedVoice]: ['AddRole', 'RemoveRole'],
	[TypeVariation.SetNickname]: ['Nickname', 'Nickname'],
	[TypeVariation.RoleAdd]: ['AddRole', 'RemoveRole'],
	[TypeVariation.RoleRemove]: ['RemoveRole', 'AddRole'],
	[TypeVariation.RestrictedEmoji]: ['AddRole', 'RemoveRole'],
	[TypeVariation.Timeout]: ['Timeout', 'TimeoutEnd']
} as const satisfies Readonly<Record<TypeVariation, readonly [ModerationRecordAction, ModerationRecordAction]>>;

/**
 * Resolves the action of the table for a type and its metadata.
 *
 * @param type - The type of the case.
 * @param metadata - The metadata of the case.
 */
export function getModerationRecordAction(type: TypeVariation, metadata: TypeMetadata): ModerationRecordAction {
	const [apply, undo] = TypeToAction[type];
	return (metadata & TypeMetadata.Undo) === TypeMetadata.Undo ? undo : apply;
}

/**
 * Encodes the type and the metadata of a case in the `metadata` column.
 *
 * @param type - The type of the case.
 * @param metadata - The metadata of the case.
 */
export function encodeModerationRecordMetadata(type: TypeVariation, metadata: TypeMetadata): number {
	return TypeEncodedMarker | (type << TypeShift) | (metadata & MetadataMask);
}

/**
 * Decodes the type and the metadata of a case from a record.
 *
 * @param action - The action of the record.
 * @param metadata - The `metadata` column of the record.
 */
export function decodeModerationRecordMetadata(action: ModerationRecordAction, metadata: number): { type: TypeVariation; metadata: TypeMetadata } {
	if ((metadata & TypeEncodedMarker) === TypeEncodedMarker) {
		return { type: ((metadata & TypeMask) >> TypeShift) as TypeVariation, metadata: (metadata & MetadataMask) as TypeMetadata };
	}

	// The record was not written by this encoder, resolve the type from the action:
	const [type, implied] = ActionToType[action];
	return { type, metadata: ((metadata & MetadataMask) | implied) as TypeMetadata };
}

/**
 * Converts a duration in milliseconds to the seconds stored in the table.
 *
 * @param duration - The duration in milliseconds.
 */
export function encodeModerationRecordDuration(duration: number | null): number {
	return duration === null ? 0 : Math.round(duration / 1000);
}

/**
 * Converts the seconds stored in the table to a duration in milliseconds.
 *
 * @param duration - The duration in seconds.
 */
export function decodeModerationRecordDuration(duration: number): number | null {
	return duration === 0 ? null : duration * 1000;
}

/**
 * Converts a row of the table to a {@linkcode ModerationRecord}.
 *
 * @param row - The row of the table.
 */
export function fromModerationRow(row: ModerationRow): ModerationRecord {
	const { type, metadata } = decodeModerationRecordMetadata(row.action, row.metadata);
	return {
		id: row.id,
		createdAt: parseTimestamp(row.createdAt),
		duration: decodeModerationRecordDuration(row.duration),
		guildId: row.guildId.toString(),
		moderatorId: row.moderatorId.toString(),
		userId: row.targetId.toString(),
		reason: row.reason,
		type,
		metadata
	};
}

/**
 * Converts a {@linkcode ModerationRecord} to the columns of the table.
 *
 * @param record - The record to convert.
 */
export function toModerationRow(record: ModerationRecord) {
	return {
		id: record.id,
		guildId: BigInt(record.guildId),
		action: getModerationRecordAction(record.type, record.metadata),
		metadata: encodeModerationRecordMetadata(record.type, record.metadata),
		createdAt: new Date(record.createdAt).toISOString() as ModerationData['createdAt'],
		duration: encodeModerationRecordDuration(record.duration),
		targetId: BigInt(record.userId),
		moderatorId: BigInt(record.moderatorId),
		reason: record.reason,
		referenceId: null
	} satisfies ModerationRow;
}
