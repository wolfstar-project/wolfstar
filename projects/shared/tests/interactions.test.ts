import { hasModalComponent } from '../src/interactions';

describe('hasModalComponent', () => {
	// A select menu Discord nests in a label, with nothing picked:
	const components = [
		{ type: 18, component: { custom_id: 'allowedMembers', values: [] } },
		{ type: 1, components: [{ custom_id: 'status', value: 'enabled' }] }
	];

	test('GIVEN a select menu with nothing picked THEN it is there', () => {
		expect(hasModalComponent(components, 'allowedMembers')).toBe(true);
	});

	test('GIVEN a text input in a row THEN it is there', () => {
		expect(hasModalComponent(components, 'status')).toBe(true);
	});

	test('GIVEN a modal built before the component was added THEN it is not there', () => {
		expect(hasModalComponent(components, 'ignoredMembers')).toBe(false);
	});
});
