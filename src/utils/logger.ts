/**
 * Pino logger configuration
 */

import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.isProduction ? 'info' : 'debug',
  transport: config.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
});

export function createChildLogger(name: string) {
  return logger.child({ name });
}
