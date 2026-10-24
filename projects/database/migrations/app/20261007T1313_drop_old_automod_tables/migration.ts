#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/c8f64700c979c63af005d3d6e657065eeb92dedb3af0c372fe04d05040a37f41/contract';
import startContract from '../../snapshots/c8f64700c979c63af005d3d6e657065eeb92dedb3af0c372fe04d05040a37f41/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/decaa6be52016fc91730f487d1901ea7e68f2e71ddd4456da03dae095f90ee44/contract';
import endContract from '../../snapshots/decaa6be52016fc91730f487d1901ea7e68f2e71ddd4456da03dae095f90ee44/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.dropTable({ schema: 'public', table: 'GuildAutoModerationAttachments' }),
			this.dropTable({ schema: 'public', table: 'GuildAutoModerationCapitals' }),
			this.dropTable({ schema: 'public', table: 'GuildAutoModerationInvites' }),
			this.dropTable({ schema: 'public', table: 'GuildAutoModerationLinks' }),
			// The overrides reference the mentions, so they go first:
			this.dropTable({ schema: 'public', table: 'GuildAutoModerationMentionsOverrides' }),
			this.dropTable({ schema: 'public', table: 'GuildAutoModerationMentions' }),
			this.dropTable({ schema: 'public', table: 'GuildAutoModerationNewlines' }),
			this.dropTable({ schema: 'public', table: 'GuildAutoModerationNoMentionSpam' }),
			this.dropTable({ schema: 'public', table: 'GuildAutoModerationWords' }),
			this.dropTable({ schema: 'public', table: 'GuildAutoModerationZalgo' })
		];
	}
}

MigrationCLI.run(import.meta.url, M);
