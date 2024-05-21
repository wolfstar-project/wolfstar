import { Task } from '#lib/database/settings/structures/Task';
import { Store } from '@sapphire/framework';

export class TaskStore extends Store<Task, 'tasks'> {
	/**
	 * Constructs our TaskStore for use in Wolf
	 * @param client The client that instantiates this store
	 */
	public constructor() {
		super(Task, { name: 'tasks' });
		this.container.client.stores.register(this);
	}
}
