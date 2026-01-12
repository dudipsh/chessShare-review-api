/**
 * Review controller - Handles game review requests
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { reviewRequestSchema, validateRequest } from '../../utils/validation.js';
import { GameReviewService } from '../../services/GameReviewService.js';
import { incrementRateLimitCounter } from '../middleware/rateLimiter.js';
import { logger } from '../../utils/logger.js';
import { createApiError } from '../middleware/errorHandler.js';
import {
  ReviewProgressEvent,
  MoveAnalyzedEvent,
  ReviewCompleteEvent,
  ReviewErrorEvent,
} from '../../types/index.js';

const reviewLogger = logger.child({ controller: 'review' });

export class ReviewController {
  private gameReviewService: GameReviewService;

  constructor() {
    this.gameReviewService = new GameReviewService();
  }

  /**
   * Start a new game review with SSE streaming
   */
  async startReview(req: AuthenticatedRequest, res: Response): Promise<void> {
    // Validate request body
    const validation = validateRequest(reviewRequestSchema, req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation error',
        details: validation.errors.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    const { pgn, playerColor, gameId, options } = validation.data;
    const userId = req.user?.id;

    reviewLogger.info({ userId, playerColor, gameId }, 'Starting game review');

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Helper to send SSE events
    const sendEvent = (
      event: ReviewProgressEvent | MoveAnalyzedEvent | ReviewCompleteEvent | ReviewErrorEvent
    ) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      // Run the game review
      const result = await this.gameReviewService.reviewGame(pgn, playerColor, {
        depth: options?.depth,
        onProgress: (current, total) => {
          sendEvent({
            type: 'progress',
            currentMove: current,
            totalMoves: total,
            percentage: Math.round((current / total) * 100 * 10) / 10,
          });
        },
        onMoveAnalyzed: (moveData) => {
          sendEvent({
            type: 'move',
            moveNumber: moveData.moveNumber,
            fen: moveData.fen,
            move: moveData.move,
            markerType: moveData.markerType,
            centipawnLoss: moveData.centipawnLoss,
            evaluationBefore: moveData.evaluationBefore,
            evaluationAfter: moveData.evaluationAfter,
            bestMove: moveData.bestMove,
          });
        },
      });

      // Increment rate limit counter
      if (userId) {
        await incrementRateLimitCounter(userId);
      }

      // Send completion event
      sendEvent({
        type: 'complete',
        reviewId: gameId || crypto.randomUUID(),
        accuracy: result.accuracy,
        summary: result.summary,
        totalMoves: result.totalMoves,
      });

      reviewLogger.info(
        { userId, accuracy: result.accuracy },
        'Game review completed'
      );
    } catch (error) {
      reviewLogger.error({ error, userId }, 'Game review failed');

      sendEvent({
        type: 'error',
        message: error instanceof Error ? error.message : 'Analysis failed',
        code: 'ANALYSIS_ERROR',
      });
    } finally {
      res.end();
    }
  }

  /**
   * Analyze a single position (quick endpoint)
   */
  async analyzePosition(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { fen, depth } = req.body;

    if (!fen || typeof fen !== 'string') {
      throw createApiError('FEN is required', 400, 'INVALID_FEN');
    }

    try {
      const result = await this.gameReviewService.analyzePosition(fen, { depth });
      res.json(result);
    } catch (error) {
      reviewLogger.error({ error, fen }, 'Position analysis failed');
      throw createApiError(
        'Analysis failed',
        500,
        'ANALYSIS_ERROR',
        error instanceof Error ? error.message : undefined
      );
    }
  }
}

// Singleton instance
export const reviewController = new ReviewController();
