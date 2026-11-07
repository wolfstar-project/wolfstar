import { planJoinGuardActions } from '#lib/moderation/joinguard/plan';
import { createRule } from './fixtures';

const on = { joinGuardCheckpoint: true, joinGuardDirectMessage: true };

describe('planJoinGuardActions', () => {
	test('GIVEN a ban and a kick THEN the ban wins, and the member is neither sent to the checkpoint nor given a role', () => {
		const kick = createRule({ id: '1', name: 'Kick', hardAction: 'Kick', roleId: '100' });
		const ban = createRule({ id: '2', name: 'Ban', hardAction: 'Ban' });
		const checkpoint = createRule({ id: '3', name: 'Check', sendToCheckpoint: true });

		const plan = planJoinGuardActions([kick, ban, checkpoint], on);

		expect(plan.stop).toEqual({ kind: 'Ban', rule: ban });
		expect(plan.roles).toEqual([]);
		expect(plan.checkpointOff).toBe(false);
	});

	test('GIVEN a kick and the checkpoint THEN the kick wins', () => {
		const kick = createRule({ id: '1', hardAction: 'Kick' });
		expect(planJoinGuardActions([createRule({ id: '2', sendToCheckpoint: true }), kick], on).stop).toEqual({ kind: 'Kick', rule: kick });
	});

	test('GIVEN the checkpoint THEN the first rule that asks for it decides it', () => {
		const first = createRule({ id: '1', name: 'First', sendToCheckpoint: true });
		const plan = planJoinGuardActions([first, createRule({ id: '2', sendToCheckpoint: true })], on);

		expect(plan.stop).toEqual({ kind: 'Checkpoint', rule: first });
	});

	test('GIVEN a guild with the checkpoint off THEN nobody is sent there, and the log is told', () => {
		const plan = planJoinGuardActions([createRule({ sendToCheckpoint: true })], { ...on, joinGuardCheckpoint: false });

		expect(plan.stop).toEqual({ kind: 'None' });
		expect(plan.checkpointOff).toBe(true);
		expect(plan.directMessage).toBe(false);
	});

	test('GIVEN several rules THEN every role and alert runs once, an alert naming the rules of its channel', () => {
		const plan = planJoinGuardActions(
			[
				createRule({ id: '1', name: 'A', roleId: '100', alertChannelId: '500' }),
				createRule({ id: '2', name: 'B', roleId: '100', alertChannelId: '500' }),
				createRule({ id: '3', name: 'C', roleId: '200', alertChannelId: '600' })
			],
			on
		);

		expect(plan.roles).toEqual(['100', '200']);
		expect(plan.alerts).toEqual([
			{ channelId: '500', rules: ['A', 'B'] },
			{ channelId: '600', rules: ['C'] }
		]);
	});

	test('GIVEN the direct messages THEN one is sent when a rule asks or the member is stopped and the guild tells', () => {
		expect(planJoinGuardActions([createRule({ directMessage: true })], { ...on, joinGuardDirectMessage: false }).directMessage).toBe(true);
		expect(planJoinGuardActions([createRule({ sendToCheckpoint: true })], on).directMessage).toBe(true);
		expect(planJoinGuardActions([createRule({ sendToCheckpoint: true })], { ...on, joinGuardDirectMessage: false }).directMessage).toBe(false);
		expect(planJoinGuardActions([createRule({ roleId: '100' })], on).directMessage).toBe(false);
	});
});
