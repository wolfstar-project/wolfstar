import { Colors } from '#utils/constants';
import { renderStatus, renderStatusUpdate } from '#utils/status';
import { ComponentType, MessageFlags } from 'discord-api-types/v10';

describe('renderStatus', () => {
	test('GIVEN a success THEN it is one green container with the text, which only the user sees', () => {
		const message = renderStatus('success', 'Case 1 deleted.');
		const [container] = message.components;

		expect(message.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
		expect(message.allowed_mentions).toEqual({ parse: [] });
		expect(container.accent_color).toBe(Colors.Green);
		expect(container.components).toHaveLength(1);
		expect(container.components[0]).toMatchObject({ type: ComponentType.TextDisplay });
		expect((container.components[0] as { content: string }).content).toMatch(/ Case 1 deleted\.$/);
	});

	test('GIVEN an information THEN its container has no colour', () => {
		expect(renderStatus('info', 'Nothing to show.').components[0]).not.toHaveProperty('accent_color');
	});

	test.each([
		['warning', Colors.Yellow],
		['error', Colors.Red]
	] as const)('GIVEN a %s THEN its container has its colour', (kind, color) => {
		expect(renderStatus(kind, 'Text').components[0].accent_color).toBe(color);
	});

	test('GIVEN a message everybody sees THEN it is not ephemeral', () => {
		expect(renderStatus('success', 'Done.', { ephemeral: false }).flags).toBe(MessageFlags.IsComponentsV2);
	});
});

describe('renderStatusUpdate', () => {
	test('GIVEN a message that had a content and embeds THEN the status empties both', () => {
		const message = renderStatusUpdate('error', 'Cancelled.');

		expect(message).toMatchObject({ content: '', embeds: [], flags: MessageFlags.IsComponentsV2 });
		expect(message.components[0].accent_color).toBe(Colors.Red);
	});
});
