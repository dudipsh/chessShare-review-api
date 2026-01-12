/**
 * Express application setup
 */

import express from 'express';
import helmet from 'helmet';
import { corsMiddleware } from './api/middleware/cors.middleware.js';
import { errorHandler } from './api/middleware/errorHandler.js';
import apiRoutes from './api/routes/index.js';
import { logger } from './utils/logger.js';

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(corsMiddleware);

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
      },
      'Request completed'
    );
  });

  next();
});

// API routes
app.use('/api/v1', apiRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'ChessShare Review API',
    version: '1.0.0',
    status: 'running',
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use(errorHandler);

export default app;
