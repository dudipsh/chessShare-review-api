/**
 * Inaccuracy Detector
 * Main orchestrator for detecting "Inaccuracy" moves
 * 
 * An inaccuracy is a small error that slightly worsens the position.
 * It's the mildest form of suboptimal play (0.35-1.0 pawns).
 * 
 * Unlike mistakes or blunders, inaccuracies are often:
 * - Understandable given the position complexity
 * - Positional rather than tactical in nature
 * - Minor deviations from computer-optimal play
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { MarkerType } from '../../types/index.js';
import { 
  INACCURACY_THRESHOLDS, 
  InaccuracyType, 
  InaccuracyResult 
} from './InaccuracyThresholds.js';

/**
 * Context for inaccuracy detection
 */
export interface InaccuracyContext {
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
}

export class InaccuracyDetector {
  /**
   * Main entry point - detect if a move is an "Inaccuracy"
   * 
   * @param ctx - Context with move and evaluation data
   * @returns InaccuracyResult with classification details
   */
  isInaccuracy(ctx: InaccuracyContext): InaccuracyResult {
    const { move, centipawnLoss, evalBefore, evalAfter, moveNumber } = ctx;

    // Apply game phase forgiveness
    const adjustedCpLoss = this._applyGamePhaseForgiveness(centipawnLoss, moveNumber);

    // Early rejection: Too small (good move)
    if (adjustedCpLoss < INACCURACY_THRESHOLDS.MIN_CP_LOSS) {
      return { isInaccuracy: false, centipawnLoss };
    }

    // Early rejection: Too large (miss or mistake)
    if (adjustedCpLoss >= INACCURACY_THRESHOLDS.MAX_CP_LOSS) {
      return { isInaccuracy: false, centipawnLoss };
    }

    // Early rejection: Extreme positions
    if (this._shouldSkipExtremePosition(evalBefore)) {
      return { isInaccuracy: false, centipawnLoss };
    }

    // Early rejection: Too early in game
    if (moveNumber !== undefined && moveNumber < INACCURACY_THRESHOLDS.MIN_MOVE_NUMBER) {
      return { isInaccuracy: false, centipawnLoss };
    }

    // Classify the type of inaccuracy
    const type = this._classifyInaccuracyType(move, evalBefore, evalAfter, moveNumber);

    return {
      isInaccuracy: true,
      type,
      reason: this._getReasonForType(type),
      centipawnLoss,
      suggestedMarker: MarkerType.INACCURACY,
    };
  }

  /**
   * Legacy compatibility method
   */
  isInaccuracyMove(move: ExtendedChessMove, centipawnLoss: number): boolean {
    return this.isInaccuracy({ move, centipawnLoss }).isInaccuracy;
  }

  /**
   * Check if centipawn loss is in inaccuracy range (quick check)
   */
  isInInaccuracyRange(centipawnLoss: number): boolean {
    return centipawnLoss >= INACCURACY_THRESHOLDS.MIN_CP_LOSS &&
           centipawnLoss < INACCURACY_THRESHOLDS.MAX_CP_LOSS;
  }

  /**
   * Get the marker type for an inaccuracy
   */
  getInaccuracyMarker(): MarkerType {
    return MarkerType.INACCURACY;
  }

  /**
   * Apply game phase forgiveness to centipawn loss
   */
  private _applyGamePhaseForgiveness(cpLoss: number, moveNumber?: number): number {
    if (moveNumber === undefined) return cpLoss;

    let forgiveness: number;
    
    if (moveNumber <= 8) {
      forgiveness = INACCURACY_THRESHOLDS.OPENING_FORGIVENESS;
    } else if (moveNumber <= 15) {
      forgiveness = INACCURACY_THRESHOLDS.POST_OPENING_FORGIVENESS;
    } else if (moveNumber >= 40) {
      forgiveness = INACCURACY_THRESHOLDS.ENDGAME_FORGIVENESS;
    } else {
      forgiveness = INACCURACY_THRESHOLDS.MIDDLEGAME_FORGIVENESS;
    }

    return cpLoss * forgiveness;
  }

  /**
   * Check if should skip due to extreme position
   */
  private _shouldSkipExtremePosition(evalBefore?: number): boolean {
    if (!INACCURACY_THRESHOLDS.SKIP_EXTREME_POSITIONS) return false;
    if (evalBefore === undefined) return false;
    
    return Math.abs(evalBefore) >= INACCURACY_THRESHOLDS.EXTREME_POSITION_THRESHOLD;
  }

  /**
   * Classify the type of inaccuracy
   */
  private _classifyInaccuracyType(
    move: ExtendedChessMove,
    evalBefore?: number,
    evalAfter?: number,
    moveNumber?: number
  ): InaccuracyType {
    // Development inaccuracy in opening
    if (moveNumber !== undefined && moveNumber <= 10) {
      return InaccuracyType.DEVELOPMENT;
    }

    // Check if move was tactical but suboptimal
    if (this._isTacticalMove(move)) {
      return InaccuracyType.TACTICAL;
    }

    // Default to positional
    return InaccuracyType.POSITIONAL;
  }

  /**
   * Get reason text for inaccuracy type
   */
  private _getReasonForType(type: InaccuracyType): string {
    switch (type) {
      case InaccuracyType.DEVELOPMENT:
        return 'Suboptimal development';
      case InaccuracyType.TACTICAL:
        return 'Slight tactical imprecision';
      case InaccuracyType.POSITIONAL:
        return 'Slight positional inaccuracy';
      default:
        return 'Small inaccuracy';
    }
  }

  /**
   * Check if move is tactical in nature
   */
  private _isTacticalMove(move: ExtendedChessMove): boolean {
    return move.san?.includes('x') || move.san?.includes('+') || false;
  }
}

// Export singleton for easy usage
export const inaccuracyDetector = new InaccuracyDetector();

