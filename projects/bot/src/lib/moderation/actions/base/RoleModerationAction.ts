import { readSettings, writeSettings, writeSettingsTransaction } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common/util';
import { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import type { TranslationKey } from '#types';
import { resolveOnErrorCodes } from '#common';
import { getCodeStyle, getStickyRoles } from '#utils/functions';
import type { TypeVariation } from '#utils/moderationConstants';
import { inlineCode } from '@discordjs/builders';
import { DiscordAPIError, HTTPError } from '@discordjs/rest';
import { isNullish, type Awaitable } from '@sapphire/utilities';
import { UserError, container } from '@wolfstar/http-framework';
import {
	PermissionsBitField,
	type AnyChannel,
	type Guild,
	type GuildMember,
	type PermissionOverwriteOptions,
	type Role,
	type RoleEditOptions,
	type User
} from '@wolfstar/plugin-gateway';
import { ChannelType, PermissionFlagsBits, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';

/**
 * The maximum amount of roles a guild can have.
 */
const MaximumRoles = 250;

interface Overrides {
	bitfield: bigint;
	array: readonly (keyof typeof PermissionFlagsBits)[];
	options: PermissionOverwriteOptions;
}

/**
 * A channel of a guild that has permission overwrites.
 */
export type PermissionOverwritesChannel = Extract<AnyChannel, { permissionOverwrites: unknown; fetchPermissionsFor: unknown }>;

export abstract class RoleModerationAction<ContextType = never, Type extends TypeVariation = TypeVariation> extends ModerationAction<
	ContextType,
	Type
> {
	/**
	 * Represents the key of a role used in a moderation action.
	 */
	public readonly roleKey: RoleModerationAction.RoleKey;

	/**
	 * Indicates whether the existing roles should be replaced.
	 */
	protected readonly replace: boolean;

	/**
	 * Represents the data of a role for setup purposes.
	 */
	protected readonly roleData: RoleModerationAction.RoleData;

	/**
	 * The representation of the role overrides for text-based channels.
	 */
	protected readonly roleOverridesText: Overrides;
	/**
	 * The representation of the role overrides for voice-based channels.
	 */
	protected readonly roleOverridesVoice: Overrides;
	/**
	 * The representation of the role overrides for generic and mixed channels.
	 */
	protected readonly roleOverridesMerged: Overrides;

	public constructor(options: RoleModerationAction.ConstructorOptions<Type>) {
		super({ isUndoActionAvailable: true, ...options });
		this.replace = options.replace ?? false;

		this.roleKey = options.roleKey;
		this.roleData = options.roleData;

		this.roleOverridesText = this.#resolveOverrides(options.roleOverridesText ?? 0n);
		this.roleOverridesVoice = this.#resolveOverrides(options.roleOverridesVoice ?? 0n);
		this.roleOverridesMerged = this.#resolveOverrides(this.roleOverridesText.bitfield | this.roleOverridesVoice.bitfield);
	}

	public override async isActive(guild: Guild, userId: Snowflake) {
		const settings = await readSettings(guild);
		const roleId = settings[this.roleKey];
		if (isNullish(roleId)) return false;

		const member = await resolveOnErrorCodes(container.gatewayClient.members.fetch(guild.id, userId), RESTJSONErrorCodes.UnknownMember);
		return !isNullish(member) && member.roleIds.includes(roleId);
	}

	/**
	 * Sets up the role moderation action.
	 *
	 * @remarks
	 *
	 * The confirmation is not bound to a message: the caller provides the
	 * `confirm` callback (an interaction prompt, for example).
	 *
	 * @param options - The guild where the setup is being performed, the user
	 * that triggered the setup and the confirmation callback.
	 * @returns A Promise that resolves once the setup is complete.
	 * @throws {UserError} If a mute role already exists or if there are too many roles in the guild.
	 */
	public async setup(options: RoleModerationAction.SetupOptions) {
		const { guild, author, confirm } = options;
		const settings = await readSettings(guild);
		const roleId = settings[this.roleKey];
		const roles = await container.gatewayClient.roles.fetchAll(guild.id);
		if (roleId && roles.some((role) => role.id === roleId)) throw new UserError({ identifier: 'moderationActions:setupMuteExists' });
		if (roles.length >= MaximumRoles) throw new UserError({ identifier: 'moderationActions:setupTooManyRoles' });

		const role = await container.gatewayClient.roles.create(guild.id, {
			...this.roleData,
			reason: `[Role Setup] Authorized by ${author.username} (${author.id}).`
		});
		using trx = await writeSettingsTransaction(guild);
		await trx.write({ [this.roleKey]: role.id }).submit();

		const t = await fetchGuildT(guild);
		const manageable = await this.#fetchManageableChannels(guild);
		const permissions = this.roleOverridesMerged.array.map((key) => inlineCode(t(`permissions:${key}` as TranslationKey)));
		// The `{{LOADING}}` placeholder is a default variable of the i18next instance, which the typed options do not model:
		const content = t('moderationActions:sharedRoleSetupAsk', {
			role: role.name,
			channels: manageable.length,
			permissions: permissions.join(', ')
		} as never) as unknown as string;
		if (await confirm(content)) {
			await this.updateChannelsOverrides(guild, role);
		}
	}

	/**
	 * Updates the channel overrides for a given guild and role.
	 *
	 * This method iterates through all the channels in the guild, excluding threads, and updates the channel overrides
	 * for the specified role if the bot has the necessary permissions.
	 *
	 * @param guild - The guild where the channels are located.
	 * @param role - The role for which the channel overrides should be updated.
	 */
	public async updateChannelsOverrides(guild: Guild, role: Role | Snowflake) {
		const channels = await this.#fetchManageableChannels(guild);
		for (const channel of channels) {
			// Update the channel overrides:
			await this.updateChannelOverrides(channel, role);
		}
	}

	/**
	 * Updates the channel overrides for a given role.
	 *
	 * @param channel - The channel to update the overrides for.
	 * @param role - The role to update the overrides with.
	 * @returns A promise that resolves to `true` if the overrides were updated successfully, or `false` otherwise.
	 */
	public async updateChannelOverrides(channel: PermissionOverwritesChannel, role: Role | Snowflake) {
		const options = this.#getChannelOverrides(channel);
		if (options === null) return false;

		await channel.permissionOverwrites.edit(typeof role === 'string' ? role : role.id, options);
		return true;
	}

	protected override handleApplyPre(
		guild: Guild,
		entry: ModerationAction.Entry<Type>,
		data: ModerationAction.Data<ContextType>
	): Awaitable<unknown>;

	protected override async handleApplyPre(guild: Guild, entry: ModerationAction.Entry<Type>) {
		const member = await this.#fetchMember(guild, entry);
		const role = await this.#fetchRole(guild);

		const me = await container.gatewayClient.members.fetchMe(guild.id);
		if (!(await me.fetchPermissions()).has(PermissionFlagsBits.ManageRoles)) {
			throw new UserError({ identifier: 'moderationActions:actionCannotManageRoles' });
		}

		const position = (await me.roles.fetchHighest())?.position ?? 0;
		if (role.position >= position) {
			throw new UserError({ identifier: 'moderationActions:actionRoleHigherPosition' });
		}

		await (await getStickyRoles(guild)).add(entry.userId, role.id);

		const reason = await this.getReason(guild, entry.reason);
		const data = this.replace
			? await this.#handleApplyPreRolesReplace(member, role, reason, position)
			: await this.#handleApplyPreRolesAdd(member, role, reason);
		Reflect.set(entry, 'extraData' satisfies keyof typeof entry, data);
	}

	protected override handleUndoPre(guild: Guild, entry: ModerationAction.Entry<Type>, data: ModerationAction.Data<ContextType>): Awaitable<unknown>;

	protected override async handleUndoPre(guild: Guild, entry: ModerationAction.Entry<Type>) {
		const member = await this.#fetchMember(guild, entry);
		const role = await this.#fetchRole(guild);

		const me = await container.gatewayClient.members.fetchMe(guild.id);
		if (!(await me.fetchPermissions()).has(PermissionFlagsBits.ManageRoles)) {
			throw new UserError({ identifier: 'moderationActions:actionCannotManageRoles' });
		}

		const position = (await me.roles.fetchHighest())?.position ?? 0;
		if (role.position >= position) {
			throw new UserError({ identifier: 'moderationActions:actionRoleHigherPosition' });
		}

		await (await getStickyRoles(guild)).remove(entry.userId, role.id);

		const reason = await this.getReason(guild, entry.reason, true);
		if (this.replace) {
			await this.#handleUndoPreRolesReplace(guild, member, role, reason, position);
		} else {
			await this.#handleUndoPreRolesRemove(member, role, reason);
		}
	}

	/**
	 * Handles the roles replace operation for a given member.
	 *
	 * This method extracts the roles from the member, adds the specified role, and updates the member's roles with the
	 * new set of roles.
	 *
	 * @param member - The guild member to apply the operation to.
	 * @param role - The role to add to the member.
	 * @param reason - The reason for applying the operation.
	 * @param position - The position of the role in the hierarchy.
	 * @returns An array of removed roles.
	 */
	async #handleApplyPreRolesReplace(member: GuildMember, role: Role, reason: string, position: number) {
		const { keepRoles, removedRoles } = await this.#extractRoles(member, position);
		keepRoles.add(role.id);

		await member.edit({ roles: [...keepRoles], reason });
		return [...removedRoles];
	}

	/**
	 * Handles the apply action for adding the action role to a member.
	 *
	 * @param member - The guild member to apply the roles to.
	 * @param role - The role to add to the member.
	 * @param reason - The reason for adding the role.
	 * @returns A Promise that resolves to `null` when the role addition is complete.
	 */
	async #handleApplyPreRolesAdd(member: GuildMember, role: Role, reason: string) {
		await member.roles.add(role.id, reason);
		return null;
	}

	/**
	 * Handles the undo operation for replacing pre-existing roles for a member.
	 *
	 * - If there is no previous moderation entry for the member, the specified role will be removed.
	 * - If there is a previous moderation entry, the pre-existing roles that are not managed and have a position
	 * lower than the specified position will be restored for the member.
	 *
	 * @param guild - The guild where the member is.
	 * @param member - The guild member to handle the undo operation for.
	 * @param role - The role to remove if there is no previous moderation entry.
	 * @param reason - The reason for the undo operation.
	 * @param position - The position of the role that triggered the moderation action.
	 */
	async #handleUndoPreRolesReplace(guild: Guild, member: GuildMember, role: Role, reason: string, position: number) {
		const entry = await this.completeLastModerationEntryFromUser({ guild, userId: member.id! });
		if (isNullish(entry)) {
			await member.roles.remove(role.id, reason);
			return;
		}

		const guildRoles = new Map((await container.gatewayClient.roles.fetchAll(guild.id)).map((role) => [role.id, role]));
		const roles = new Set(member.roleIds);
		for (const roleId of Array.isArray(entry.extraData) ? entry.extraData : []) {
			const role = guildRoles.get(roleId);
			// Add the ids that are:
			// - In the cache.
			// - Lower than Wolf's hierarchy position.
			if (!isNullish(role) && !role.managed && role.position < position) roles.add(roleId);
		}

		// Remove the action role from the set:
		roles.delete(role.id);

		await member.edit({ roles: [...roles], reason });
	}

	/**
	 * Handles the undo action for removing the action role from a member.
	 *
	 * @param member - The guild member to remove the role from.
	 * @param role - The role to be removed.
	 * @param reason - The reason for removing the role.
	 */
	async #handleUndoPreRolesRemove(member: GuildMember, role: Role, reason: string) {
		await member.roles.remove(role.id, reason);
	}

	/**
	 * Fetches the channels of the guild where the bot can edit the permission
	 * overwrites, skipping threads and the channels that cannot have any.
	 *
	 * @param guild - The guild to fetch the channels from.
	 */
	async #fetchManageableChannels(guild: Guild) {
		const me = await container.gatewayClient.members.fetchMe(guild.id);
		const required = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles;

		const output: PermissionOverwritesChannel[] = [];
		for (const channel of await guild.channels.fetch()) {
			// Skip threads and the channels that do not have permission overwrites:
			if (!isPermissionOverwritesChannel(channel)) continue;

			// Skip if the bot can't manage the channel:
			const permissions = await channel.fetchPermissionsFor(me);
			if (!permissions.has(required)) continue;

			output.push(channel);
		}

		return output;
	}

	/**
	 * Retrieves the channel overrides for the given channel.
	 * If the channel is a category channel, it returns the merged role overrides options.
	 * If the channel is both a text-based and voice-based channel, it returns the merged role overrides options.
	 * If the channel is a text-based channel, it returns the text-based role overrides options.
	 * If the channel is a voice-based channel, it returns the voice-based role overrides options.
	 * If the channel does not match any of the above conditions, it returns null.
	 *
	 * @param channel - The channel to retrieve the overrides for.
	 * @returns The channel overrides options or null if no overrides are found.
	 */
	#getChannelOverrides(channel: PermissionOverwritesChannel) {
		switch (channel.type) {
			case ChannelType.GuildCategory:
			// Voice and stage channels are also text-based, hence they are "mixed" channels:
			case ChannelType.GuildVoice:
			case ChannelType.GuildStageVoice:
				return this.roleOverridesMerged.options;
			case ChannelType.GuildText:
			case ChannelType.GuildAnnouncement:
				return this.roleOverridesText.options;
			default:
				return null;
		}
	}

	/**
	 * Resolves the overrides for the given bitfield.
	 *
	 * @param bitfield - The bitfield to resolve overrides for.
	 * @returns The resolved overrides object.
	 */
	#resolveOverrides(bitfield: bigint): Overrides {
		const array = new PermissionsBitField(bitfield).toArray();
		const options = Object.fromEntries(array.map((key) => [key, false]));
		return { bitfield, array, options };
	}

	/**
	 * Fetches the member from the guild using the provided options.
	 *
	 * @remarks
	 * If the member is not found, a {@link UserError} with the identifier `moderationActions:requiredMember` is thrown.
	 * Otherwise, the error is re-thrown.
	 *
	 * @param guild The guild to fetch the member from.
	 * @param entry The entry containing the user ID.
	 * @returns A Promise that resolves to the fetched member.
	 */
	async #fetchMember(guild: Guild, entry: ModerationAction.Entry<Type>) {
		try {
			return await container.gatewayClient.members.fetch(guild.id, entry.userId);
		} catch (error) {
			this.#handleFetchMemberError(error as Error);
		}
	}

	#handleFetchMemberError(error: Error): never {
		if (error instanceof DiscordAPIError) this.#handleFetchMemberDiscordError(error);
		if (error instanceof HTTPError) this.#handleFetchMemberHttpError(error);
		throw error;
	}

	#handleFetchMemberDiscordError(error: DiscordAPIError): never {
		if (error.code === RESTJSONErrorCodes.UnknownMember) {
			throw new UserError({ identifier: 'moderationActions:requiredMember' });
		}

		throw error;
	}

	#handleFetchMemberHttpError(error: HTTPError): never {
		container.logger.error(this.logPrefix, getCodeStyle(error.status), error.url);
		throw error;
	}

	/**
	 * Fetches the role associated with this moderation action from the guild.
	 * Throws an error if the role is not configured, doesn't exist, or is a managed role.
	 *
	 * @param guild - The guild to fetch the role from.
	 * @returns The fetched role.
	 * @throws If the role is not configured or if it is a managed role.
	 */
	async #fetchRole(guild: Guild) {
		const settings = await readSettings(guild);
		const roleId = settings[this.roleKey];
		if (isNullish(roleId)) throw new UserError({ identifier: 'moderationActions:actionRoleNotConfigured' });

		const role =
			(await container.gatewayClient.roles.cache.get(container.gatewayClient.roles.resolveKey(guild.id, roleId))) ??
			(await this.#fetchRoleFromApi(guild, roleId));
		if (isNullish(role)) {
			await writeSettings(guild, { [this.roleKey]: null });
			throw new UserError({ identifier: 'moderationActions:actionRoleNotConfigured' });
		}

		if (role.managed) {
			throw new UserError({ identifier: 'moderationActions:actionRoleManaged' });
		}

		return role;
	}

	async #fetchRoleFromApi(guild: Guild, roleId: Snowflake) {
		const roles = await container.gatewayClient.roles.fetchAll(guild.id);
		return roles.find((role) => role.id === roleId);
	}

	async #extractRoles(member: GuildMember, highestPosition: number) {
		const keepRoles = new Set<Snowflake>();
		const removedRoles = new Set<Snowflake>();

		// Iterate over all the member's roles.
		for (const role of await member.roles.fetch()) {
			// The `@everyone` role is implicit, it is neither kept nor removed.
			if (role.id === member.guildId) continue;
			// Managed roles cannot be removed.
			if (role.managed) keepRoles.add(role.id);
			// Roles with higher hierarchy position cannot be removed.
			else if (role.position >= highestPosition) keepRoles.add(role.id);
			// Else it is fine to remove the role.
			else removedRoles.add(role.id);
		}

		return { keepRoles, removedRoles };
	}
}

/**
 * Whether the channel is a guild channel that supports permission overwrites and is not a thread.
 *
 * @param channel - The channel to check.
 */
export function isPermissionOverwritesChannel(channel: AnyChannel): channel is PermissionOverwritesChannel {
	return 'permissionOverwrites' in channel && 'fetchPermissionsFor' in channel;
}

export namespace RoleModerationAction {
	export type RoleData = Pick<RoleEditOptions, 'name' | 'color' | 'hoist' | 'mentionable' | 'permissions'>;

	export interface ConstructorOptions<Type extends TypeVariation = TypeVariation> extends Omit<
		ModerationAction.ConstructorOptions<Type>,
		'isUndoActionAvailable'
	> {
		replace?: boolean;
		roleKey: RoleKey;
		roleData: RoleData;
		roleOverridesText: bigint | null;
		roleOverridesVoice: bigint | null;
	}

	export interface SetupOptions {
		/**
		 * The guild where the setup is performed.
		 */
		guild: Guild;

		/**
		 * The user that triggered the setup.
		 */
		author: Pick<User, 'id' | 'username'>;

		/**
		 * Asks the user whether the channel overrides should be updated.
		 *
		 * @param content - The content of the question.
		 * @returns Whether the user confirmed.
		 */
		confirm: (content: string) => Awaitable<boolean>;
	}

	export type Options<Type extends TypeVariation = TypeVariation> = ModerationAction.Options<Type>;
	export type PartialOptions<Type extends TypeVariation = TypeVariation> = ModerationAction.PartialOptions<Type>;

	export type Data = ModerationAction.Data;

	export const enum RoleKey {
		All = 'rolesMuted',
		Reaction = 'rolesRestrictedReaction',
		Embed = 'rolesRestrictedEmbed',
		Emoji = 'rolesRestrictedEmoji',
		Attachment = 'rolesRestrictedAttachment',
		Voice = 'rolesRestrictedVoice'
	}
}
