/**
 * What the startup banner tells about the process, read from the environment and the client by `main.ts`.
 */
export interface StartupStatus {
	/** Whether the analytics are written to InfluxDB. */
	readonly analytics: boolean;
	/** The Redis server the cache, the sessions and the broker share. */
	readonly redis: { readonly host: string; readonly port: number };
	readonly role: GatewayRole | WorkerRole;
}

/** The process that connects to Discord and serves the interactions. */
export interface GatewayRole {
	readonly mode: 'gateway';
	readonly shards: number | 'auto';
	readonly http: { readonly address: string; readonly port: number };
	/** Where the API listens, `null` when `API_ENABLED` is off. */
	readonly api: { readonly host: string; readonly port: number } | null;
	/** The stream it forwards every dispatch onto, `null` when `BROKER_ENABLED` is off. */
	readonly brokerStream: string | null;
}

/** A process that replays the dispatches the gateway forwards: it has no HTTP server and no API. */
export interface WorkerRole {
	readonly mode: 'worker';
	readonly broker: { readonly stream: string; readonly group: string; readonly consumer: string };
}

/**
 * The status lines of the startup banner. A worker shows the stream it reads and its name in the consumer group, and
 * leaves out the HTTP server and the API it never starts; the gateway says whether it forwards the dispatches.
 */
export function formatStartupStatus({ analytics, redis, role }: StartupStatus): string[] {
	const status = (enabled: boolean) => (enabled ? '+' : '-');
	const lines =
		role.mode === 'worker'
			? [
					`[+] Mode      : worker, replaying the dispatches of the gateway`,
					`[+] Broker    : ${role.broker.stream}, group ${role.broker.group}, consumer ${role.broker.consumer}`,
					`[${status(analytics)}] Analytics`
				]
			: [
					`[+] Mode      : gateway, ${role.shards} shards`,
					`[${status(role.brokerStream !== null)}] Broker    : ${role.brokerStream === null ? 'off' : `forwarding to ${role.brokerStream}`}`,
					`[${status(analytics)}] Analytics`,
					`[+] HTTP      : ${role.http.address}:${role.http.port}`,
					`[${status(role.api !== null)}] API       : ${role.api === null ? 'off' : `${role.api.host}:${role.api.port}`}`
				];
	lines.push(`[+] Redis     : ${redis.host}:${redis.port}`);
	return lines.map((line, index) => `${index === lines.length - 1 ? '└─' : '├─'} ${line}`);
}
