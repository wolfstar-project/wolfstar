#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/980a69acebd0d8ba87c3b64fcce3e72325a3a5991ddddd78f5edfdaae605d7ff/contract';
import startContract from '../../snapshots/980a69acebd0d8ba87c3b64fcce3e72325a3a5991ddddd78f5edfdaae605d7ff/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ba952aa49cb805d9444eee38008cd730b9751e9b867a702d75fb04010a45ce5a/contract';
import endContract from '../../snapshots/ba952aa49cb805d9444eee38008cd730b9751e9b867a702d75fb04010a45ce5a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [this.dropTable({ schema: 'public', table: 'GuildGreetings' }), this.dropTable({ schema: 'public', table: 'GuildRoleMessage' })];
	}
}

MigrationCLI.run(import.meta.url, M);
