import type { NodeSDK } from '@opentelemetry/sdk-node';
import type { SpanExporter } from '@opentelemetry/sdk-trace';

export declare function startTracing(): Promise<NodeSDK>;
export declare function getInstrumentationConfig(): {
	'@opentelemetry/instrumentation-undici': {
		startSpanHook: (request: { origin: string; path: string }) => Record<string, string>;
	};
};
export declare function redactDiscordTokens(path: string): string;
export declare function createEnvironmentSpanExporter(): Promise<SpanExporter>;
export declare function createSentrySpanExporter(dsn: string | undefined): Promise<SpanExporter | undefined>;
