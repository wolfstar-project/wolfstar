import type { SchemaGroup } from '#lib/database/settings/schema/SchemaGroup';

export interface ISchemaValue {
	readonly type: string;
	readonly name: string;
	readonly dashboardOnly: boolean;
	readonly parent: SchemaGroup | null;
}
