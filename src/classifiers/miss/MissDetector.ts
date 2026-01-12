/**
 * Miss Detector
 * Main orchestrator for detecting "Miss" moves
 * 
 * A "Miss" is when a player fails to find a tactical opportunity.
 * It's lighter than a mistake (1.0-1.5 pawns vs 1.5-2.5 pawns).
 * 
 * Miss typically occurs when:
 * - Best move was a tactical shot (capture, check, fork)
 * - Player played a reasonable move but missed the tactic
 * - Position allowed a winning combination that wasn't found
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { MarkerType } from '../../types/index.js';
import { TacticalMissAnalyzer } from './TacticalMissAnalyzer.js';
import { WinningMoveAnalyzer } from './WinningMoveAnalyzer.js';
import { MISS_THRESHOLDS, MissType, MissResult } from './MissThresholds.js';

/**
 * Context for miss detection
 */
export interface MissContext {
  /** The move to analyze */
  move: ExtendedChessMove;
  /** Centipawn loss vs best move */
  centipawnLoss: number;
  /** Position evaluation before move (in centipawns) */
  evalBefore?: number;
  /** Position evaluation after move (in centipawns) */
  evalAfter?: number;
  /** Current move number */
  moveNumber?: number;
  /** Best move in the position (if known) */
  bestMove?: string;
  /** Whether best move was a capture */
  bestMoveWasCapture?: boolean;
  /** Whether best move was a check */
  bestMoveWasCheck?: boolean;
  /** Whether best move was a fork */
  bestMoveWasFork?: boolean;
  /** Evaluation after best move */
  bestMoveEval?: number;
  /** Mate-in count for best move */
  mateInBest?: number;
  /** Mate-in count for played move */
  mateInPlayed?: number;
}

export class MissDetector {
  private _tacticalAnalyzer = new TacticalMissAnalyzer();
  private _winningAnalyzer = new WinningMoveAnalyzer();

  /**
   * Main entry point - detect if a move is a "Miss"
   * 
   * @param ctx - Context with move and evaluation data
   * @returns MissResult with classification details
   */
  isMiss(ctx: MissContext): MissResult {
    const {
      move,
      centipawnLoss,
      evalBefore,
      evalAfter,
      moveNumber,
      bestMove,
      bestMoveWasCapture,
      bestMoveWasCheck,
      bestMoveWasFork,
      bestMoveEval,
      mateInBest,
      mateInPlayed,
    } = ctx;

    // Apply game phase forgiveness
    const adjustedCpLoss = this._applyGamePhaseForgiveness(centipawnLoss, moveNumber);

    // Early rejection: Too small for miss (good move)
    if (adjustedCpLoss < MISS_THRESHOLDS.MIN_CP_LOSS) {
      return { isMiss: false, centipawnLoss };
    }

    // Early rejection: Too large for miss (mistake)
    if (adjustedCpLoss >= MISS_THRESHOLDS.MAX_CP_LOSS) {
      return { isMiss: false, centipawnLoss };
    }

    // Early rejection: Position already losing
    if (this._shouldSkipLosingPosition(evalBefore)) {
      return { isMiss: false, centipawnLoss };
    }

    // Early rejection: Too early in game
    if (moveNumber !== undefined && moveNumber < MISS_THRESHOLDS.MIN_MOVE_NUMBER) {
      return { isMiss: false, centipawnLoss };
    }

    // Check for missed winning move (mate or crushing advantage)
    const winningResult = this._winningAnalyzer.analyzeMissedGameEnder(
      move,
      adjustedCpLoss,
      mateInBest,
      mateInPlayed,
      evalAfter // ✅ Pass evalAfter to check if position is still winning
    );
    if (winningResult.isMiss) return winningResult;

    // Check for missed fork
    if (bestMoveWasFork) {
      const forkResult = this._tacticalAnalyzer.analyzeMissedFork(
        move,
        adjustedCpLoss,
        bestMoveWasFork
      );
      if (forkResult.isMiss) return forkResult;
    }

    // Check for tactical miss (capture, check)
    const tacticalResult = this._tacticalAnalyzer.analyzeTacticalMiss(
      move,
      adjustedCpLoss,
      bestMove,
      bestMoveWasCapture,
      bestMoveWasCheck
    );
    if (tacticalResult.isMiss) return tacticalResult;

    // Check for missed winning continuation
    const winningMoveResult = this._winningAnalyzer.analyzeWinningMiss(
      move,
      adjustedCpLoss,
      evalBefore,
      evalAfter,
      bestMoveEval
    );
    if (winningMoveResult.isMiss) return winningMoveResult;

    // Generic classification if in range and best move was tactical
    return this._classifyGenericMiss(adjustedCpLoss, bestMove);
  }

  /**
   * Legacy compatibility method
   */
  isMissMove(move: ExtendedChessMove, centipawnLoss: number): boolean {
    return this.isMiss({ move, centipawnLoss }).isMiss;
  }

  /**
   * Check if centipawn loss is in miss range (quick check)
   */
  isInMissRange(centipawnLoss: number): boolean {
    return centipawnLoss >= MISS_THRESHOLDS.MIN_CP_LOSS &&
           centipawnLoss < MISS_THRESHOLDS.MAX_CP_LOSS;
  }

  /**
   * Get the marker type for a miss
   */
  getMissMarker(): MarkerType {
    return MarkerType.MISS;
  }

  /**
   * Apply game phase forgiveness to centipawn loss
   */
  private _applyGamePhaseForgiveness(cpLoss: number, moveNumber?: number): number {
    if (moveNumber === undefined) return cpLoss;

    let forgiveness: number = MISS_THRESHOLDS.MIDDLEGAME_FORGIVENESS;

    if (moveNumber <= 8) {
      forgiveness = MISS_THRESHOLDS.OPENING_FORGIVENESS;
    } else if (moveNumber >= 40) {
      forgiveness = MISS_THRESHOLDS.ENDGAME_FORGIVENESS;
    }

    return cpLoss * forgiveness;
  }

  /**
   * Check if should skip due to losing position
   */
  private _shouldSkipLosingPosition(evalBefore?: number): boolean {
    if (evalBefore === undefined) return false;
    return evalBefore <= MISS_THRESHOLDS.LOSING_POSITION_THRESHOLD;
  }

  /**
   * Generic miss classification if in range
   */
  private _classifyGenericMiss(centipawnLoss: number, bestMove?: string): MissResult {
    // Only classify as miss if best move looks tactical
    if (MISS_THRESHOLDS.REQUIRE_TACTICAL_BEST_MOVE && !this._looksTactical(bestMove)) {
      return { isMiss: false, centipawnLoss };
    }

    if (centipawnLoss >= MISS_THRESHOLDS.MIN_CP_LOSS &&
        centipawnLoss < MISS_THRESHOLDS.MAX_CP_LOSS) {
      return {
        isMiss: true,
        type: MissType.GENERAL,
        reason: 'Missed tactical opportunity',
        centipawnLoss,
        missedMoveWas: bestMove,
        suggestedMarker: MarkerType.MISS,
      };
    }
    return { isMiss: false, centipawnLoss };
  }

  /**
   * Check if move looks tactical
   */
  private _looksTactical(san?: string): boolean {
    if (!san) return false;
    return san.includes('x') || san.includes('+') || san.includes('=');
  }
}

// Export singleton for easy usage
export const missDetector = new MissDetector();

