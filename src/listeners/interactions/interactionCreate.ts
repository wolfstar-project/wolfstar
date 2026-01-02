import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type Interaction } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.InteractionCreate })
export class UserListener extends Listener {
	public run(interaction: Interaction) {
		if (!interaction.isMessageComponent()) return;

		for (const llic of this.container.client.lliCollectors) {
			// Attempt to route interactions only to collectors that are associated with
			// the message that triggered the interaction. If the collector exposes a
			// `messageId` or `message.id` property, use that as routing metadata.
			const anyCollector = llic as any;
			const targetMessageId: string | undefined = anyCollector.messageId ?? anyCollector.message?.id;

			if (targetMessageId && interaction.message?.id !== targetMessageId) {
				continue;
			}
			llic.send(interaction);
		}
	}
}
