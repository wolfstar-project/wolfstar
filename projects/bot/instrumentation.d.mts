import type { NodeSDK } from '@opentelemetry/sdk-node';
import type { SpanExporter } from '@opentelemetry/sdk-trace';

export declare function startTracing(): Promise<NodeSDK>;
export declare function createSentrySpanExporter(dsn: string | undefined): Promise<SpanExporter | undefined>;
