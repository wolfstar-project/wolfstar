import { Command } from '@sapphire/framework';

export class WolfCommand extends Command {
	public readonly permissionLevel: number;

	public constructor(context: Command.LoaderContext, options: WolfCommand.Options) {
		super(context, options);
		this.permissionLevel = options.permissionLevel ?? 0;
	}

	public get category(): string {
		return this.fullCategory.join('.');
	}
}

export namespace WolfCommand {
	export interface Options extends Command.Options {
		permissionLevel?: number;
	}

	export type Args = Command.Args;
	export type Context = Command.Context;
}
