/**
 * Puzzle extraction routes
 */

import { Router } from 'express';
import { puzzleController } from '../controllers/puzzle.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { rateLimiterMiddleware } from '../middleware/rateLimiter.js';

const router = Router();

/**
 * POST /api/v1/puzzles/extract
 * Extract puzzles from a game
 *
 * Request body:
 * {
 *   reviewId?: string,     // Optional existing review ID
 *   pgn: string,           // PGN of the game
 *   playerColor: 'white' | 'black',
 *   gameRating?: number,   // Player's rating (for puzzle rating calc)
 *   openingName?: string   // Opening name to include in puzzles
 * }
 *
 * Response:
 * {
 *   puzzles: ExtractedPuzzle[],
 *   totalExtracted: number,
 *   breakdown: {
 *     mistakes: number,
 *     missedTactics: number,
 *     positivePuzzles: number
 *   }
 * }
 */
router.post(
  '/extract',
  authMiddleware,
  rateLimiterMiddleware,
  (req, res, next) => {
    puzzleController.extractPuzzles(req, res).catch(next);
  }
);

/**
 * POST /api/v1/puzzles/solution
 * Generate solution sequence for a single puzzle position
 *
 * Request body:
 * {
 *   fen: string,           // Position FEN
 *   bestMove: string,      // Best move in UCI format
 *   isPositivePuzzle?: boolean  // True if this is a brilliant/great move
 * }
 *
 * Response:
 * {
 *   fen: string,
 *   bestMove: string,
 *   solution: string[],    // UCI moves
 *   solutionSequence: SolutionMove[]  // Detailed solution with metadata
 * }
 */
router.post(
  '/solution',
  authMiddleware,
  (req, res, next) => {
    puzzleController.generateSolution(req, res).catch(next);
  }
);

export default router;
