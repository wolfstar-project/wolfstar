import { Table, TableColumn, TableForeignKey, TableUnique, type MigrationInterface, type QueryRunner } from 'typeorm';

export class V81RemoveTwitchSubscriptions1720000000000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable('twitch_subscriptions', true);
		await queryRunner.dropTable('guild_subscription', true, true);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(
			new Table({
				name: 'twitch_subscriptions',
				uniques: [
					new TableUnique({
						name: 'streamer_id_subscription_type_uniq',
						columnNames: ['streamer_id', 'subscription_type']
					})
				],
				columns: [
					new TableColumn({
						name: 'id',
						type: 'int',
						isPrimary: true,
						isNullable: false,
						isGenerated: true,
						generationStrategy: 'increment'
					}),
					new TableColumn({
						name: 'streamer_id',
						type: 'varchar',
						length: '10',
						isNullable: false
					}),
					new TableColumn({
						name: 'subscription_id',
						type: 'varchar',
						length: '36',
						isNullable: false
					}),
					new TableColumn({
						name: 'subscription_type',
						type: 'twitch_subscriptions_subscription_type_enum',
						isNullable: false
					})
				]
			}),
			true,
			true
		);

		await queryRunner.createTable(
			new Table({
				name: 'guild_subscription',
				foreignKeys: [
					new TableForeignKey({
						name: 'twitch_subscriptions_id_subscription_id_fkey',
						columnNames: ['subscription_id'],
						referencedColumnNames: ['id'],
						referencedTableName: 'twitch_subscriptions',
						onDelete: 'NO ACTION',
						onUpdate: 'NO ACTION'
					})
				],
				columns: [
					new TableColumn({
						name: 'guild_id',
						type: 'varchar',
						length: '19',
						isNullable: false,
						isPrimary: true
					}),
					new TableColumn({
						name: 'channel_id',
						type: 'varchar',
						length: '19',
						isNullable: false,
						isPrimary: true
					}),
					new TableColumn({
						name: 'message',
						type: 'varchar',
						length: '50',
						isNullable: true
					}),
					new TableColumn({
						name: 'subscription_id',
						type: 'integer',
						isNullable: false,
						isPrimary: true
					})
				]
			}),
			true,
			true
		);
	}
}
