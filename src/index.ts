/**
 * ChessShare Review API - Entry Point
 */

// Load environment variables FIRST, before any other imports
import 'dotenv/config';

import app from './app.js';
import { config, validateConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { initializeStockfishPool, disposeStockfishPool } from './engine/StockfishPool.js';

const startServer = async () => {
  // Validate configuration
  validateConfig();

  logger.info(
    {
      nodeEnv: config.nodeEnv,
      port: config.port,
      stockfishPath: config.stockfishPath,
      poolSize: config.stockfishPoolSize,
    },
    'Starting ChessShare Review API'
  );

  // Initialize Stockfish pool
  try {
    logger.info('Initializing Stockfish pool...');
    await initializeStockfishPool();
    logger.info('Stockfish pool initialized successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Stockfish pool');
    process.exit(1);
  }

  // Start HTTP server
  const server = app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
    logger.info(`Health check: http://localhost:${config.port}/api/v1/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Dispose Stockfish pool
    try {
      await disposeStockfishPool();
      logger.info('Stockfish pool disposed');
    } catch (error) {
      logger.error({ error }, 'Error disposing Stockfish pool');
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
};

startServer().catch((error) => {
  logger.fatal({ error }, 'Failed to start server');
  process.exit(1);
});
