import { readSettings, writeSettingsTransaction, type PermissionsNode } from '#lib/database';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction, type TranslationKey } from '#lib/structures/commands/utils';
import { resolveOnErrorCodes } from '#utils/common';
import type { SlashCommandBuilder, SlashCommandSubcommandBuilder } from '@discordjs/builders';
import { Command, UserError, container, type TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits, RESTJSONErrorCodes } from 'discord-api-types/v10';

const Root = 'commands/management';
const MaximumContentLength = 2000;

/**
 * Configures the permission nodes of the server, which replaces the prefix `permission-nodes` command.
 *
 * @remarks
 *
 * - The `add`, `remove`, `reset` and `show` subcommands take the role or the user as a mentionable `target`, the
 *   command as a `command` option with autocomplete, and the `type` (`allow` or `deny`) as a choice.
 * - A command is either `*` or the name a slash command is registered with. The `category.*` and `category.sub-category.command`
 *   forms, and the aliases, of the prefix commands do not exist for slash commands.
 * - `PermissionNodeManager` is still bound to `discord.js`, so the nodes are edited with the functions at the bottom of
 *   this file, which follow the same rules.
 * - The prefix command defaulted to `show` and listed every node when it had no target, which is what `show` does
 *   without a `target`.
 */
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry
			.registerChatInputCommand((builder) => registerCommand(builder))
			.registerSubcommand((builder) => registerAddOrRemove(builder, 'Add'), 'chatInputRunAdd')
			.registerSubcommand((builder) => registerAddOrRemove(builder, 'Remove'), 'chatInputRunRemove')
			.registerSubcommand((builder) => registerReset(builder), 'chatInputRunReset')
			.registerSubcommand((builder) => registerShow(builder), 'chatInputRunShow');
	}

	public override autocompleteRun(interaction: Command.AutocompleteInteraction, args: Command.AutocompleteArguments<{ command: string }>) {
		if (args.focused !== 'command') return interaction.replyEmpty();

		const query = (args.command ?? '').toLowerCase();
		const choices: { name: string; value: string }[] = [];
		if ('*'.startsWith(query)) choices.push({ name: '*', value: '*' });
		for (const name of getSlashCommandNames()) {
			if (choices.length >= 25) break;
			if (name.toLowerCase().includes(query)) choices.push({ name, value: name });
		}

		return interaction.reply({ choices });
	}

	public async chatInputRunAdd(interaction: UserCommand.Interaction, options: UserCommand.NodeArguments) {
		return this.#run(interaction, async (t) => {
			const target = await resolveTarget(interaction, options.target);
			const action = options.type;

			// Permission Nodes do not allow allows for the @everyone role:
			if (target.id === interaction.guildId && action === 'allow') {
				throw new UserError({ identifier: `${Root}:permissionNodesCannotAllowEveryone` });
			}

			if (!(await checkPermissions(interaction, target))) throw new UserError({ identifier: `${Root}:permissionNodesHigher` });

			const command = resolveCommand(options.command);
			using trx = await writeSettingsTransaction(interaction.guildId);
			const key = target.isRole ? 'permissionsRoles' : 'permissionsUsers';
			await trx.write({ [key]: addNode(trx.settings[key], target.id, command, action) }).submitWithAudit(interaction.user.id);

			return translateKey(t, `${Root}:permissionNodesAdd`);
		});
	}

	public async chatInputRunRemove(interaction: UserCommand.Interaction, options: UserCommand.NodeArguments) {
		return this.#run(interaction, async (t) => {
			const target = await resolveTarget(interaction, options.target);
			const command = resolveCommand(options.command);

			if (!(await checkPermissions(interaction, target))) throw new UserError({ identifier: `${Root}:permissionNodesHigher` });

			using trx = await writeSettingsTransaction(interaction.guildId);
			const key = target.isRole ? 'permissionsRoles' : 'permissionsUsers';
			await trx.write({ [key]: removeNode(trx.settings[key], target.id, command, options.type) }).submitWithAudit(interaction.user.id);

			return translateKey(t, `${Root}:permissionNodesRemove`);
		});
	}

	public async chatInputRunReset(interaction: UserCommand.Interaction, options: UserCommand.TargetArguments) {
		return this.#run(interaction, async (t) => {
			const target = await resolveTarget(interaction, options.target);

			if (!(await checkPermissions(interaction, target))) throw new UserError({ identifier: `${Root}:permissionNodesHigher` });

			using trx = await writeSettingsTransaction(interaction.guildId);
			const key = target.isRole ? 'permissionsRoles' : 'permissionsUsers';
			await trx.write({ [key]: resetNode(trx.settings[key], target.id) }).submitWithAudit(interaction.user.id);

			return translateKey(t, `${Root}:permissionNodesReset`);
		});
	}

	public async chatInputRunShow(interaction: UserCommand.Interaction, options: Partial<UserCommand.TargetArguments>) {
		return this.#run(interaction, async (t) => {
			const content = options.target //
				? await this.#showOne(interaction, t, options.target)
				: await this.#showAll(interaction, t);
			return content.slice(0, MaximumContentLength);
		});
	}

	async #showOne(interaction: UserCommand.Interaction, t: TFunction, mentionable: TransformedArguments.Mentionable) {
		const target = await resolveTarget(interaction, mentionable);
		if (!(await checkPermissions(interaction, target))) throw new UserError({ identifier: `${Root}:permissionNodesHigher` });

		const settings = await readSettings(interaction.guildId);
		const nodes = target.isRole ? settings.permissionsRoles : settings.permissionsUsers;
		const node = nodes.find((n) => n.id === target.id);
		if (node === undefined) throw new UserError({ identifier: `${Root}:permissionNodesNodeNotExists` });

		return formatPermissionNode(t, node, target.name);
	}

	async #showAll(interaction: UserCommand.Interaction, t: TFunction) {
		const settings = await readSettings(interaction.guildId);
		const roles = await container.gatewayClient.roles.fetchAll(interaction.guildId);
		const positions = new Map(roles.map((role) => [role.id, role] as const));

		const output: string[] = [];
		for (const node of settings.permissionsUsers) {
			const member = await resolveOnErrorCodes(
				container.gatewayClient.members.fetch(interaction.guildId, node.id),
				RESTJSONErrorCodes.UnknownMember
			);
			if (!member) continue;

			const target: ResolvedTarget = {
				id: node.id,
				isRole: false,
				name: member.displayName ?? member.user?.username ?? node.id,
				position: getHighestPosition(member.roleIds, positions)
			};
			if (!(await checkPermissions(interaction, target, positions))) continue;
			output.push(`> ${formatPermissionNode(t, node, target.name)}`);
		}

		for (const node of settings.permissionsRoles) {
			const role = positions.get(node.id);
			if (!role) continue;

			const target: ResolvedTarget = { id: role.id, isRole: true, name: role.name, position: role.position };
			if (!(await checkPermissions(interaction, target, positions))) continue;
			output.push(`> ${formatPermissionNode(t, node, target.name)}`);
		}

		if (output.length === 0) throw new UserError({ identifier: `${Root}:permissionNodesNodeNotExists` });
		return output.join('\n\n');
	}

	/**
	 * Gates a handler behind the administrator level, replies with its result, and translates a {@linkcode UserError}.
	 */
	async #run(interaction: UserCommand.Interaction, callback: (t: TFunction) => Promise<string>) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		try {
			const content = await callback(t);
			return await interaction.reply({ content, flags: MessageFlags.Ephemeral });
		} catch (error) {
			if (!(error instanceof UserError)) throw error;

			const content = translateKey(t, error.identifier as TranslationKey, error.context as Record<string, unknown> | undefined);
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}
	}
}

export namespace UserCommand {
	export type Interaction = GuildChatInputInteraction;

	export interface TargetArguments {
		target: TransformedArguments.Mentionable;
	}

	export interface NodeArguments extends TargetArguments {
		type: NodeType;
		command: string;
	}

	export type NodeType = 'allow' | 'deny';
}

function registerCommand(builder: SlashCommandBuilder) {
	return applyLocalizedBuilder(builder, `${Root}:permissionNodes`)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
}

function registerAddOrRemove(subcommand: SlashCommandSubcommandBuilder, name: 'Add' | 'Remove') {
	return applyLocalizedBuilder(subcommand, `${Root}:permissionNodesSubcommand${name}`)
		.addMentionableOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsTarget').setRequired(true))
		.addStringOption((option) =>
			applyLocalizedBuilder(option, `${Root}:permissionNodesOptionsType`)
				.setRequired(true)
				.setChoices(
					createLocalizedChoice(`${Root}:permissionNodesOptionsTypeChoiceAllow`, { value: 'allow' }),
					createLocalizedChoice(`${Root}:permissionNodesOptionsTypeChoiceDeny`, { value: 'deny' })
				)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsCommand').setRequired(true).setAutocomplete(true));
}

function registerReset(subcommand: SlashCommandSubcommandBuilder) {
	return applyLocalizedBuilder(subcommand, `${Root}:permissionNodesSubcommandReset`) //
		.addMentionableOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsTarget').setRequired(true));
}

function registerShow(subcommand: SlashCommandSubcommandBuilder) {
	return applyLocalizedBuilder(subcommand, `${Root}:permissionNodesSubcommandShow`) //
		.addMentionableOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsTarget').setRequired(false));
}

interface ResolvedTarget {
	id: string;
	isRole: boolean;
	name: string;
	/**
	 * The position of the role, or the position of the highest role of the member.
	 */
	position: number;
}

async function resolveTarget(interaction: GuildChatInputInteraction, mentionable: TransformedArguments.Mentionable): Promise<ResolvedTarget> {
	if ('role' in mentionable) {
		const { role } = mentionable;
		return { id: role.id, isRole: true, name: role.name, position: role.position };
	}

	if ('user' in mentionable) {
		const roles = await container.gatewayClient.roles.fetchAll(interaction.guildId);
		const positions = new Map(roles.map((role) => [role.id, role] as const));
		const { user, member } = mentionable;
		return {
			id: user.id,
			isRole: false,
			name: member?.nick ?? user.global_name ?? user.username,
			position: getHighestPosition(member?.roles ?? [], positions)
		};
	}

	throw new UserError({ identifier: 'arguments:memberError', context: { parameter: mentionable.id } });
}

function getHighestPosition(roleIds: readonly string[], roles: ReadonlyMap<string, { position: number }>) {
	let highest = 0;
	for (const id of roleIds) {
		const position = roles.get(id)?.position;
		if (position !== undefined && position > highest) highest = position;
	}
	return highest;
}

/**
 * Checks whether the author can edit and preview the nodes of a target.
 */
async function checkPermissions(
	interaction: GuildChatInputInteraction,
	target: ResolvedTarget,
	roles?: ReadonlyMap<string, { position: number }>
): Promise<boolean> {
	const authorId = interaction.user.id;

	// If it's to itself, always block
	if (authorId === target.id) return false;

	const guild = await container.gatewayClient.guilds.fetch(interaction.guildId);

	// If the target is the owner, always block
	if (guild.ownerId === target.id) return false;

	// If the author is the owner, always allow
	if (authorId === guild.ownerId) return true;

	// Check hierarchy role positions, allow when greater, block otherwise
	roles ??= new Map((await container.gatewayClient.roles.fetchAll(interaction.guildId)).map((role) => [role.id, role] as const));
	const authorPosition = getHighestPosition(interaction.member.roles, roles);
	return authorPosition > target.position;
}

/**
 * Resolves a command option, which is either `*` or the name of a loaded command.
 */
function resolveCommand(name: string): string {
	if (name === '*') return name;

	const lowerCased = name.toLowerCase();
	for (const commandName of getSlashCommandNames()) {
		if (commandName.toLowerCase() === lowerCased) return commandName;
	}

	throw new UserError({ identifier: `${Root}:permissionNodesCommandInvalid`, context: { command: name } });
}

/**
 * The names the loaded chat input commands are registered with, which are not the names of their pieces.
 */
function getSlashCommandNames(): Set<string> {
	const names = new Set<string>();
	for (const command of container.stores.get('commands').values()) {
		const chatInput = command.registry?.chatInput;
		if (chatInput) names.add(chatInput.toJSON().name);
	}

	return names;
}

function formatPermissionNode(t: TFunction, node: PermissionsNode, name: string) {
	return [
		translateKey(t, `${Root}:permissionNodesShowName`, { name }),
		translateKey(t, `${Root}:permissionNodesShowAllow`, { allow: formatCommands(t, node.allow) }),
		translateKey(t, `${Root}:permissionNodesShowDeny`, { deny: formatCommands(t, node.deny) })
	].join('\n');
}

function formatCommands(t: TFunction, commands: readonly string[]) {
	return commands.length === 0
		? translateKey(t, 'globals:none')
		: translateKey(t, 'globals:andListValue', { value: commands.map((command) => `\`${command}\``) });
}

// The functions below are the `add`, `remove` and `reset` of `PermissionNodeManager`, over the nodes of one kind:

function addNode(nodes: readonly PermissionsNode[], id: string, command: string, action: UserCommand.NodeType): PermissionsNode[] {
	const nodeIndex = nodes.findIndex((n) => n.id === id);
	if (nodeIndex === -1) {
		const node: PermissionsNode = {
			id,
			allow: action === 'allow' ? [command] : [],
			deny: action === 'deny' ? [command] : []
		};

		return [...nodes, node];
	}

	const previous = nodes[nodeIndex];
	if (previous[action].includes(command)) {
		throw new UserError({ identifier: 'serializers:permissionNodeDuplicatedCommand', context: { command } });
	}

	const node: PermissionsNode = {
		id,
		allow: action === 'allow' ? previous.allow.concat(command) : previous.allow,
		deny: action === 'deny' ? previous.deny.concat(command) : previous.deny
	};

	return nodes.with(nodeIndex, node);
}

function removeNode(nodes: readonly PermissionsNode[], id: string, command: string, action: UserCommand.NodeType): PermissionsNode[] {
	const nodeIndex = nodes.findIndex((n) => n.id === id);
	if (nodeIndex === -1) throw new UserError({ identifier: `${Root}:permissionNodesNodeNotExists` });

	const previous = nodes[nodeIndex];
	const commandIndex = previous[action].indexOf(command);
	if (commandIndex === -1) throw new UserError({ identifier: `${Root}:permissionNodesCommandNotExists` });

	const node: PermissionsNode = {
		id,
		allow: action === 'allow' ? previous.allow.toSpliced(commandIndex, 1) : previous.allow,
		deny: action === 'deny' ? previous.deny.toSpliced(commandIndex, 1) : previous.deny
	};

	return node.allow.length === 0 && node.deny.length === 0 //
		? nodes.toSpliced(nodeIndex, 1)
		: nodes.with(nodeIndex, node);
}

function resetNode(nodes: readonly PermissionsNode[], id: string): PermissionsNode[] {
	const nodeIndex = nodes.findIndex((n) => n.id === id);
	if (nodeIndex === -1) throw new UserError({ identifier: `${Root}:permissionNodesNodeNotExists` });

	return nodes.toSpliced(nodeIndex, 1);
}
