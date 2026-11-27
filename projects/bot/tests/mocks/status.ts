import { ComponentType } from 'discord-api-types/v10';

/** Match the visible text of a status without depending on its application emoji ID. */
export function statusContaining(text: string) {
	return expect.objectContaining({
		components: [
			expect.objectContaining({
				type: ComponentType.Container,
				components: expect.arrayContaining([
					expect.objectContaining({ type: ComponentType.TextDisplay, content: expect.stringContaining(text) })
				])
			})
		]
	});
}

/** Read the visible text sent at the Discord API boundary. */
export function messageText(value: unknown): string {
	if (value === null || typeof value !== 'object') return '';
	if (Array.isArray(value)) return value.map(messageText).filter(Boolean).join('\n');
	const message = value as { content?: unknown; components?: unknown };
	return [typeof message.content === 'string' ? message.content : '', messageText(message.components)].filter(Boolean).join('\n');
}
