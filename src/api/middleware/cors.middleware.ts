/**
 * CORS middleware - Only allows requests from whitelisted domains
 */

import cors from 'cors';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const corsLogger = logger.child({ middleware: 'cors' });

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Check if origin is in allowed list
    const isAllowed = config.allowedOrigins.some((allowed) => {
      // Handle wildcard localhost
      if (allowed.startsWith('http://localhost')) {
        return origin.startsWith('http://localhost');
      }
      return origin === allowed || origin.endsWith(allowed.replace('https://', '.'));
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      corsLogger.warn({ origin }, 'Blocked request from unauthorized origin');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 hours
});
