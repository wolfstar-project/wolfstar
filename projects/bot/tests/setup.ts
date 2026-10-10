// Validates the environment (`NODE_ENV=test` selects `.env.test`) and fills `process.env`, it must stay first:
import 'varlock/auto-load';

// Nothing else is set up for every test: a test that needs the client, its caches, `container.rest` or
// `container.i18n` imports them from `tests/mocks/MockInstances.ts`, which builds a `GatewayClient` that never connects.
