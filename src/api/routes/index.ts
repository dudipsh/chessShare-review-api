/**
 * API routes index
 */

import { Router } from 'express';
import healthRoutes from './health.routes.js';
import reviewRoutes from './review.routes.js';
import puzzleRoutes from './puzzle.routes.js';

const router = Router();

// Mount routes
router.use('/health', healthRoutes);
router.use('/review', reviewRoutes);
router.use('/puzzles', puzzleRoutes);

export default router;
