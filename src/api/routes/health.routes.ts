/**
 * Health check routes
 */

import { Router, Request, Response } from 'express';
import { getStockfishPool } from '../../engine/StockfishPool.js';
import { HealthResponse } from '../../types/index.js';

const router = Router();
const startTime = Date.now();

router.get('/', (_req: Request, res: Response) => {
  const pool = getStockfishPool();
  const poolStatus = pool.getStatus();

  const response: HealthResponse = {
    status: poolStatus.initialized ? 'healthy' : 'degraded',
    stockfish: poolStatus.initialized
      ? 'ready'
      : poolStatus.workerCount > 0
        ? 'initializing'
        : 'error',
    activeAnalyses: poolStatus.activeAnalyses,
    queueLength: poolStatus.queueLength,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: '1.0.0',
  };

  const statusCode = response.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(response);
});

// Detailed status for debugging
router.get('/detailed', (_req: Request, res: Response) => {
  const pool = getStockfishPool();
  const poolStatus = pool.getStatus();

  res.json({
    ...poolStatus,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    memory: process.memoryUsage(),
    env: {
      nodeEnv: process.env.NODE_ENV,
      stockfishPath: process.env.STOCKFISH_PATH,
      poolSize: process.env.STOCKFISH_POOL_SIZE,
    },
  });
});

export default router;
