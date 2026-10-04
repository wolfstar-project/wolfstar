import type { SchemaGroup } from '#lib/database/settings/schema/SchemaGroup';
import type { ReadonlyGuildData } from '#lib/database/settings/types';
import type { Translator } from '#lib/structures/commands/utils';

export interface ISchemaValue {
	readonly type: string;
	readonly name: string;
	readonly dashboardOnly: boolean;
	readonly parent: SchemaGroup | null;
	display(settings: ReadonlyGuildData, t: Translator): Promise<string>;
}
