#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/d9315ae105942ffee9030c3d31b996bb4a1191fb9cbc13af0df577c105fdde44/contract';
import endContract from '../../snapshots/d9315ae105942ffee9030c3d31b996bb4a1191fb9cbc13af0df577c105fdde44/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createSchema({ schema: 'public' }),
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'GuildAutoModerationHardAction',
				members: ['VoiceKick', 'Warning', 'Timeout', 'Mute', 'Kick', 'Softban', 'Ban']
			}),
			this.createNativeEnumType({
				schema: 'public',
				typeName: 'ModerationActionType',
				members: [
					'AddRole',
					'RemoveRole',
					'Nickname',
					'AddWarning',
					'RemoveWarning',
					'Timeout',
					'TimeoutEnd',
					'Kick',
					'Softban',
					'Ban',
					'Unban'
				]
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
