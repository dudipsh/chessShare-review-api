/**
 * Puzzle Controller
 * Handles puzzle extraction and solution generation
 */

import type { Request, Response } from 'express';
import { puzzleExtractionService } from '../../services/PuzzleExtractionService.js';
import { solutionSequenceService } from '../../services/SolutionSequenceService.js';
import { gameReviewService } from '../../services/GameReviewService.js';
import { logger } from '../../utils/logger.js';
import type { MoveEvaluation } from '../../types/index.js';
import type { PersonalMistakeRecord, ExtractedPuzzle } from '../../types/puzzle.types.js';
import { MIN_QUALITY_SCORE } from '../../config/puzzleConstants.js';

const puzzleLogger = logger.child({ controller: 'puzzle' });

export class PuzzleController {
  /**
   * POST /api/v1/puzzles/extract
   * Extract puzzles from a game review
   */
  async extractPuzzles(req: Request, res: Response): Promise<void> {
    const { reviewId, pgn, playerColor, gameRating, openingName } = req.body;

    if (!pgn || !playerColor) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'pgn and playerColor are required',
      });
      return;
    }

    puzzleLogger.info({ reviewId, playerColor, gameRating }, 'Starting puzzle extraction');

    try {
      // First, analyze the game to get evaluations
      const reviewResult = await gameReviewService.reviewGame(pgn, playerColor);

      // Extract puzzles from evaluations
      const mistakes = puzzleExtractionService.extractMistakesFromEvaluations(
        reviewResult.evaluations,
        playerColor,
        openingName,
        gameRating
      );

      const missedTactics = puzzleExtractionService.extractMissedTactics(
        reviewResult.evaluations,
        playerColor,
        openingName,
        gameRating
      );

      const positivePuzzles = puzzleExtractionService.extractPositivePuzzles(
        reviewResult.evaluations,
        playerColor,
        openingName,
        gameRating
      );

      // Combine all puzzles
      const allPuzzles = [...mistakes, ...missedTactics, ...positivePuzzles];

      // Generate solution sequences for each puzzle
      const puzzlesWithSolutions: ExtractedPuzzle[] = [];

      for (const puzzle of allPuzzles) {
        try {
          const solution = await solutionSequenceService.generateSolution(
            puzzle.fen,
            puzzle.best_move,
            puzzle.is_positive_puzzle || false
          );

          // Calculate quality score
          const qualityScore = solutionSequenceService.calculateQualityScore(
            solution,
            !!puzzle.tactical_theme,
            puzzle.material_gain || 0,
            puzzle.evaluation_loss || 0
          );

          // Skip low quality puzzles
          if (qualityScore < MIN_QUALITY_SCORE) {
            puzzleLogger.debug(
              { fen: puzzle.fen, qualityScore },
              'Skipping low quality puzzle'
            );
            continue;
          }

          puzzlesWithSolutions.push({
            fen: puzzle.fen,
            playedMove: puzzle.played_move,
            bestMove: puzzle.best_move,
            solution: solution.map(s => s.move),
            rating: puzzle.puzzle_rating || gameRating || 1200,
            themes: puzzle.tactical_theme ? [puzzle.tactical_theme] : [],
            type: this._getPuzzleType(puzzle),
            moveNumber: puzzle.move_number,
            evaluationSwing: puzzle.evaluation_loss || 0,
            materialGain: puzzle.material_gain || 0,
          });
        } catch (error) {
          puzzleLogger.warn(
            { error, fen: puzzle.fen },
            'Failed to generate solution for puzzle'
          );
        }
      }

      puzzleLogger.info(
        {
          reviewId,
          totalExtracted: puzzlesWithSolutions.length,
          mistakes: mistakes.length,
          missedTactics: missedTactics.length,
          positivePuzzles: positivePuzzles.length,
        },
        'Puzzle extraction completed'
      );

      res.json({
        puzzles: puzzlesWithSolutions,
        totalExtracted: puzzlesWithSolutions.length,
        breakdown: {
          mistakes: mistakes.length,
          missedTactics: missedTactics.length,
          positivePuzzles: positivePuzzles.length,
        },
      });
    } catch (error) {
      puzzleLogger.error({ error, reviewId }, 'Puzzle extraction failed');
      res.status(500).json({
        error: 'Puzzle extraction failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * POST /api/v1/puzzles/solution
   * Generate solution sequence for a single position
   */
  async generateSolution(req: Request, res: Response): Promise<void> {
    const { fen, bestMove, isPositivePuzzle } = req.body;

    if (!fen || !bestMove) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'fen and bestMove are required',
      });
      return;
    }

    puzzleLogger.info({ fen: fen.slice(0, 30) }, 'Generating solution sequence');

    try {
      const solution = await solutionSequenceService.generateSolution(
        fen,
        bestMove,
        isPositivePuzzle || false
      );

      res.json({
        fen,
        bestMove,
        solution: solution.map(s => s.move),
        solutionSequence: solution,
      });
    } catch (error) {
      puzzleLogger.error({ error, fen }, 'Solution generation failed');
      res.status(500).json({
        error: 'Solution generation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Determine puzzle type from PersonalMistakeRecord
   */
  private _getPuzzleType(puzzle: PersonalMistakeRecord): 'mistake' | 'missed_tactic' | 'brilliant' {
    if (puzzle.is_positive_puzzle) {
      return 'brilliant';
    }
    if (puzzle.is_missed_tactic) {
      return 'missed_tactic';
    }
    return 'mistake';
  }
}

export const puzzleController = new PuzzleController();
