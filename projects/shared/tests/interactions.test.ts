import { getModalChecked, hasModalComponent } from '../src/interactions';

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

describe('getModalChecked', () => {
	const components = [
		{ type: 18, component: { type: 23, custom_id: 'notify', value: true } },
		{ type: 18, component: { type: 23, custom_id: 'silent', value: false } },
		{ type: 18, component: { type: 4, custom_id: 'reason', value: 'true' } }
	];

	test('GIVEN a ticked checkbox THEN it is true', () => {
		expect(getModalChecked(components, 'notify')).toBe(true);
	});

	test('GIVEN a checkbox that was left alone THEN it is false', () => {
		expect(getModalChecked(components, 'silent')).toBe(false);
	});

	test('GIVEN a text input or a modal with no such checkbox THEN it is null', () => {
		expect(getModalChecked(components, 'reason')).toBeNull();
		expect(getModalChecked(components, 'missing')).toBeNull();
	});
});
