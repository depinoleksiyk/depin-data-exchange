const pino = require('pino');

const logger = pino({
  level: process.env.GATEWAY_LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino/file', options: { destination: 1 } },
  base: { service: 'depin-data-gateway' },
});

module.exports = logger;
