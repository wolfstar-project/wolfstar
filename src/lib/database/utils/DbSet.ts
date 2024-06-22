import { connect } from '#lib/database/database.config';
import { GuildEntity } from '#lib/database/entities/GuildEntity';
import { ModerationEntity } from '#lib/database/entities/ModerationEntity';
import { ScheduleEntity } from '#lib/database/entities/ScheduleEntity';
import { UserEntity } from '#lib/database/entities/UserEntity';
import type { DataSource, Repository } from 'typeorm';

export class DbSet {
	public readonly connection: DataSource;
	public readonly guilds: Repository<GuildEntity>;
	public readonly moderations: Repository<ModerationEntity>;
	public readonly schedules: Repository<ScheduleEntity>;
	public readonly users: Repository<UserEntity>;

	private constructor(connection: DataSource) {
		this.connection = connection;
		this.guilds = this.connection.getRepository(GuildEntity);
		this.moderations = this.connection.getRepository(ModerationEntity);
		this.schedules = this.connection.getRepository(ScheduleEntity);
		this.users = this.connection.getRepository(UserEntity);
	}

	public async fetchModerationDirectMessageEnabled(id: string) {
		const entry = await this.users.findOne({ where: { id }, select: ['moderationDM'] });
		return entry?.moderationDM ?? true;
	}

	public static instance: DbSet | null = null;
	private static connectPromise: Promise<DbSet> | null;

	public static async connect() {
		return (DbSet.instance ??= await (DbSet.connectPromise ??= connect().then((connection) => {
			DbSet.connectPromise = null;
			return new DbSet(connection);
		})));
	}
}
