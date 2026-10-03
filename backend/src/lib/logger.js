const ts = () => new Date().toISOString();
const fmt = (lvl, scope, msg, meta) =>
  `${ts()} ${lvl.padEnd(5)} [${scope}] ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}`;

export const createLogger = (scope) => ({
  info: (msg, meta) => console.log(fmt('INFO', scope, msg, meta)),
  warn: (msg, meta) => console.warn(fmt('WARN', scope, msg, meta)),
  error: (msg, meta) => console.error(fmt('ERROR', scope, msg, meta)),
  debug: (msg, meta) => process.env.DEBUG && console.log(fmt('DEBUG', scope, msg, meta)),
});
