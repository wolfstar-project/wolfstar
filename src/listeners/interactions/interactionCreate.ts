import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type Interaction } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.InteractionCreate })
export class UserListener extends Listener {
	public run(interaction: Interaction) {
		if (!interaction.isMessageComponent()) return;

		for (const llic of this.container.client.lliCollectors) {
			llic.send(interaction);
		}
	}
}
