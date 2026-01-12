/**
 * Game review routes
 */

import { Router } from 'express';
import { reviewController } from '../controllers/review.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { rateLimiterMiddleware } from '../middleware/rateLimiter.js';

const router = Router();

/**
 * POST /api/v1/review
 * Start a new game review
 * Returns SSE stream with progress updates
 */
router.post(
  '/',
  authMiddleware,
  rateLimiterMiddleware,
  (req, res, next) => {
    reviewController.startReview(req, res).catch(next);
  }
);

/**
 * POST /api/v1/review/position
 * Analyze a single position (quick analysis)
 */
router.post(
  '/position',
  authMiddleware,
  (req, res, next) => {
    reviewController.analyzePosition(req, res).catch(next);
  }
);

export default router;
