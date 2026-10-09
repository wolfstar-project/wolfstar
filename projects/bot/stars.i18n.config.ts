import config from './stars.config';

// `stars codegen` for the i18n types alone: the command options are read from the built bot, which needs the
// environment of a running one. The CI checks the typed keys with this config.
export default { ...config, codegen: { commands: false } };
