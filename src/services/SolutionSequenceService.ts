/**
 * SolutionSequenceService
 * Generates solution sequences for chess puzzles
 *
 * A solution sequence is the optimal line of play starting from the puzzle position.
 * It includes:
 * - First move (the best move / puzzle solution)
 * - Opponent's best response
 * - Continuation moves until the advantage is clear
 */

import { Chess, type Square } from 'chess.js';
import { getStockfishPool } from '../engine/StockfishPool.js';
import type { SolutionMove } from '../types/puzzle.types.js';
import {
  MAX_SOLUTION_MOVES,
  MIN_ADVANTAGE_TO_END,
  UNIQUE_MOVE_THRESHOLD,
  PUZZLE_ANALYSIS_DEPTH,
} from '../config/puzzleConstants.js';
import { logger } from '../utils/logger.js';

const solutionLogger = logger.child({ service: 'SolutionSequence' });

export interface SolutionSequenceOptions {
  depth?: number;
  maxMoves?: number;
  timeout?: number;
}

export class SolutionSequenceService {
  /**
   * Generate a solution sequence for a puzzle position
   *
   * @param fen Starting position (before the puzzle move)
   * @param firstMove The best move in UCI format (puzzle answer)
   * @param isPositivePuzzle True if this is a brilliant/great move puzzle
   * @param options Optional configuration
   * @returns Array of solution moves
   */
  async generateSolution(
    fen: string,
    firstMove: string,
    isPositivePuzzle: boolean = false,
    options: SolutionSequenceOptions = {}
  ): Promise<SolutionMove[]> {
    const depth = options.depth || PUZZLE_ANALYSIS_DEPTH;
    const maxMoves = options.maxMoves || MAX_SOLUTION_MOVES;
    const timeout = options.timeout || 15000;

    const solution: SolutionMove[] = [];
    const chess = new Chess(fen);

    try {
      // Parse and apply the first move
      const from = firstMove.slice(0, 2) as Square;
      const to = firstMove.slice(2, 4) as Square;
      const promotion = firstMove.length > 4
        ? firstMove[4] as 'q' | 'r' | 'b' | 'n'
        : undefined;

      const moveResult = chess.move({ from, to, promotion });
      if (!moveResult) {
        solutionLogger.warn({ fen, firstMove }, 'Invalid first move for solution');
        return [];
      }

      // Add first move (the puzzle answer - user's move)
      solution.push({
        move: firstMove,
        isUserMove: true,
        fen: fen,
      });

      // Get Stockfish pool
      const pool = getStockfishPool();
      if (!pool.initialized) {
        solutionLogger.warn('Stockfish pool not initialized');
        return solution;
      }

      // Generate continuation moves
      for (let i = 0; i < maxMoves - 1; i++) {
        const currentFen = chess.fen();

        // Check if game is over
        if (chess.isGameOver()) {
          break;
        }

        // Analyze current position
        const analysis = await pool.analyzePosition(currentFen, { depth, timeout });
        if (!analysis || !analysis.bestMove) {
          break;
        }

        // Only check termination conditions after minimum moves (3)
        // This ensures puzzles have at least: user move → opponent response → user follow-up
        const MIN_SOLUTION_MOVES = 3;

        if (solution.length >= MIN_SOLUTION_MOVES) {
          // Check if puzzle should end
          if (this._isPuzzleComplete(analysis.evaluation, solution, chess)) {
            break;
          }

          // Check if there are multiple equally good moves (puzzle becomes unclear)
          // Only check for USER moves (odd indices in the loop)
          // Opponent can have multiple responses - that's fine
          if (i % 2 === 1 && this._hasMultipleGoodMoves(analysis)) {
            break;
          }
        }

        // Apply the best move
        const bestFrom = analysis.bestMove.slice(0, 2) as Square;
        const bestTo = analysis.bestMove.slice(2, 4) as Square;
        const bestPromotion = analysis.bestMove.length > 4
          ? analysis.bestMove[4] as 'q' | 'r' | 'b' | 'n'
          : undefined;

        const nextMove = chess.move({ from: bestFrom, to: bestTo, promotion: bestPromotion });
        if (!nextMove) {
          break;
        }

        // Determine if this is a user move or opponent move
        // In puzzles, the user alternates with the opponent
        // After the first user move, the pattern is: opponent, user, opponent, user...
        const isUserMove = i % 2 === 1;

        solution.push({
          move: analysis.bestMove,
          isUserMove,
          fen: currentFen,
        });
      }

      solutionLogger.debug(
        { puzzleFen: fen, solutionLength: solution.length },
        'Solution sequence generated'
      );

      return solution;
    } catch (error) {
      solutionLogger.error({ error, fen, firstMove }, 'Error generating solution');
      return solution;
    }
  }

  /**
   * Check if puzzle is complete (advantage is clear enough)
   * Note: This is only called after we have MIN_SOLUTION_MOVES (3)
   */
  private _isPuzzleComplete(
    evaluation: number,
    solution: SolutionMove[],
    chess: Chess
  ): boolean {
    // 1. Checkmate delivered
    if (chess.isCheckmate()) {
      return true;
    }

    // 2. Stalemate or draw
    if (chess.isStalemate() || chess.isDraw()) {
      return true;
    }

    // 3. Clear advantage achieved (500cp+ for good ending point)
    // Increased from 300cp to ensure puzzles don't end too soon
    const CLEAR_ADVANTAGE = 500;
    if (Math.abs(evaluation) >= CLEAR_ADVANTAGE) {
      return true;
    }

    // 4. Forced mate found
    if (Math.abs(evaluation) > 10000) {
      return true;
    }

    // 5. Maximum moves reached (handled in loop)
    return false;
  }

  /**
   * Check if there are multiple equally good moves
   * If so, the puzzle becomes unclear and should end
   */
  private _hasMultipleGoodMoves(analysis: {
    evaluation: number;
    topMoves?: Array<{ uci: string; cp: number }>;
  }): boolean {
    if (!analysis.topMoves || analysis.topMoves.length < 2) {
      return false;
    }

    const bestMove = analysis.topMoves[0];
    const secondBest = analysis.topMoves[1];

    // If second best move is within threshold, multiple good moves exist
    const cpDifference = Math.abs(bestMove.cp - secondBest.cp);
    return cpDifference < UNIQUE_MOVE_THRESHOLD;
  }

  /**
   * Calculate quality score for a puzzle based on solution
   */
  calculateQualityScore(
    solution: SolutionMove[],
    hasTheme: boolean,
    materialGain: number,
    evaluationSwing: number
  ): number {
    let score = 0;

    // +30 for having a tactical theme
    if (hasTheme) {
      score += 30;
    }

    // +20 for material gain >= 100cp
    if (materialGain >= 100) {
      score += 20;
    }

    // +25 for unique best move (implied if we got here)
    score += 25;

    // +15 for solution length 2-4 moves
    if (solution.length >= 2 && solution.length <= 4) {
      score += 15;
    }

    // +10 for clear evaluation swing (>200cp)
    if (evaluationSwing >= 200) {
      score += 10;
    }

    return score;
  }
}

// Export singleton instance
export const solutionSequenceService = new SolutionSequenceService();
