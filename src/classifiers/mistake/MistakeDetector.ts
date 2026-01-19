/**
 * Mistake Detector
 * Main orchestrator for detecting "Mistake" moves
 * 
 * Chess.com Definition: "The game is still close to equal, but you lost your advantage"
 * 
 * Two detection methods:
 * 1. Standard: Moves that lose significant evaluation (1.0-2.5 pawns)
 * 2. Advantage Loss: Had advantage → now equal (even with smaller CP loss)
 * 
 * This distinguishes from:
 * - Inaccuracies (0.35-1.0 pawns, no advantage loss)
 * - Blunders (2.5+ pawns or winning → losing)
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { MarkerType } from '../../types/index.js';
import { PositionalMistakeAnalyzer } from './PositionalMistakeAnalyzer.js';
import { TacticalMistakeAnalyzer } from './TacticalMistakeAnalyzer.js';
import { MISTAKE_THRESHOLDS, MistakeType, MistakeResult } from './MistakeThresholds.js';

/**
 * Context for mistake detection
 */
export interface MistakeContext {
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
  wasCapturingBestMove?: boolean;
  /** Whether position is already lost */
  isLosingPosition?: boolean;
  /** Mate-in count if applicable */
  mateIn?: number;
  /** Whether this is white's move (needed for still-winning leniency) */
  isWhiteMove?: boolean;
}

export class MistakeDetector {
  private _positionalAnalyzer = new PositionalMistakeAnalyzer();
  private _tacticalAnalyzer = new TacticalMistakeAnalyzer();

  /**
   * Main entry point - detect if a move is a "Mistake"
   * 
   * Chess.com: "The game is still close to equal, but you lost your advantage"
   * 
   * @param ctx - Context with move and evaluation data
   * @returns MistakeResult with classification details
   */
  isMistake(ctx: MistakeContext): MistakeResult {
    const {
      move,
      centipawnLoss,
      evalBefore,
      evalAfter,
      moveNumber,
      bestMove,
      wasCapturingBestMove,
      isLosingPosition,
      mateIn,
      isWhiteMove,
    } = ctx;

    // Apply game phase forgiveness
    const adjustedCpLoss = this._applyGamePhaseForgiveness(centipawnLoss, moveNumber);

    // Early rejection: Already in losing position
    if (this._shouldSkipLosingPosition(evalBefore, isLosingPosition)) {
      return { isMistake: false, centipawnLoss };
    }

    // Early rejection: In mate sequence
    if (MISTAKE_THRESHOLDS.IGNORE_IN_MATE_SEQUENCES && mateIn !== undefined) {
      return { isMistake: false, centipawnLoss };
    }

    // Early rejection: Too early in game
    if (moveNumber !== undefined && moveNumber < MISTAKE_THRESHOLDS.MIN_MOVE_NUMBER) {
      return { isMistake: false, centipawnLoss };
    }

    // Early rejection: Too large for mistake (blunder)
    if (adjustedCpLoss >= MISTAKE_THRESHOLDS.MAX_CP_LOSS) {
      return { isMistake: false, centipawnLoss };
    }

    // ✅ NEW: Early rejection: Position is STILL winning after the move
    // Chess.com doesn't call it a mistake if you're still clearly winning
    if (this._shouldSkipStillWinning(evalAfter, isWhiteMove)) {
      return { isMistake: false, centipawnLoss };
    }

    // =====================================================
    // CHECK 1: Advantage Loss Detection (Chess.com style)
    // "Game still close to equal, but you lost your advantage"
    // =====================================================
    const advantageLossResult = this._checkAdvantageLoss(
      adjustedCpLoss,
      evalBefore,
      evalAfter
    );
    if (advantageLossResult.isMistake) {
      return advantageLossResult;
    }

    // =====================================================
    // CHECK 2: Standard CP Loss threshold
    // =====================================================
    
    // Too small for standard mistake
    if (adjustedCpLoss < MISTAKE_THRESHOLDS.MIN_CP_LOSS) {
      return { isMistake: false, centipawnLoss };
    }

    // Try tactical analysis first (more concrete)
    const tacticalResult = this._tacticalAnalyzer.analyzeTactical(
      move,
      adjustedCpLoss,
      bestMove,
      wasCapturingBestMove
    );
    if (tacticalResult.isMistake) return tacticalResult;

    // Try positional analysis
    const positionalResult = this._positionalAnalyzer.analyzePositional(
      move,
      adjustedCpLoss,
      evalBefore,
      evalAfter
    );
    if (positionalResult.isMistake) return positionalResult;

    // Generic classification if in range
    return this._classifyGenericMistake(adjustedCpLoss);
  }

  /**
   * Chess.com style advantage loss detection
   * "Game still close to equal, but you lost your advantage"
   * 
   * Conditions:
   * 1. Had advantage before (eval >= +0.8)
   * 2. Now close to equal (eval between -0.6 and +0.6)
   * 3. CP loss is at least 0.7 (lower threshold for advantage loss)
   */
  private _checkAdvantageLoss(
    cpLoss: number,
    evalBefore?: number,
    evalAfter?: number
  ): MistakeResult {
    // Need both evaluations
    if (evalBefore === undefined || evalAfter === undefined) {
      return { isMistake: false, centipawnLoss: cpLoss };
    }

    // Minimum CP loss even for advantage loss
    if (cpLoss < MISTAKE_THRESHOLDS.ADVANTAGE_LOSS_MIN_CP) {
      return { isMistake: false, centipawnLoss: cpLoss };
    }

    // Check if had advantage (from player's perspective)
    const hadAdvantage = evalBefore >= MISTAKE_THRESHOLDS.HAD_ADVANTAGE_THRESHOLD;
    
    // Check if now close to equal
    const nowEqual = Math.abs(evalAfter) <= MISTAKE_THRESHOLDS.NOW_EQUAL_THRESHOLD;
    
    // Check if significantly squandered advantage
    const hadSignificantAdvantage = evalBefore >= MISTAKE_THRESHOLDS.SIGNIFICANT_ADVANTAGE;

    if (hadAdvantage && nowEqual) {
      const severity = hadSignificantAdvantage ? 'serious' : 'moderate';
      return {
        isMistake: true,
        type: MistakeType.LOST_ADVANTAGE,
        reason: hadSignificantAdvantage 
          ? 'Squandered significant advantage - position now equal'
          : 'Lost advantage - game now close to equal',
        centipawnLoss: cpLoss,
        severity,
        suggestedMarker: MarkerType.MISTAKE,
      };
    }

    return { isMistake: false, centipawnLoss: cpLoss };
  }

  /**
   * Legacy compatibility method
   */
  isMistakeMove(move: ExtendedChessMove, centipawnLoss: number): boolean {
    return this.isMistake({ move, centipawnLoss }).isMistake;
  }

  /**
   * Check if centipawn loss is in mistake range (quick check)
   */
  isInMistakeRange(centipawnLoss: number): boolean {
    return centipawnLoss >= MISTAKE_THRESHOLDS.MIN_CP_LOSS &&
           centipawnLoss < MISTAKE_THRESHOLDS.MAX_CP_LOSS;
  }

  /**
   * Get the marker type for a mistake based on severity
   */
  getMistakeMarker(centipawnLoss: number): MarkerType {
    return MarkerType.MISTAKE;
  }

  /**
   * Apply game phase forgiveness to centipawn loss
   */
  private _applyGamePhaseForgiveness(cpLoss: number, moveNumber?: number): number {
    if (moveNumber === undefined) return cpLoss;

    let forgiveness: number = MISTAKE_THRESHOLDS.MIDDLEGAME_FORGIVENESS;

    if (moveNumber <= 8) {
      forgiveness = MISTAKE_THRESHOLDS.OPENING_FORGIVENESS;
    } else if (moveNumber >= 40) {
      forgiveness = MISTAKE_THRESHOLDS.ENDGAME_FORGIVENESS;
    }

    return cpLoss * forgiveness;
  }

  /**
   * Check if should skip due to losing position
   */
  private _shouldSkipLosingPosition(
    evalBefore?: number,
    isLosingPosition?: boolean
  ): boolean {
    if (isLosingPosition) return true;

    if (evalBefore !== undefined && evalBefore <= MISTAKE_THRESHOLDS.LOSING_POSITION_THRESHOLD) {
      return true;
    }

    return false;
  }

  /**
   * ✅ NEW: Check if should skip mistake because position is STILL winning
   * Chess.com style: if you're still clearly winning (+2 pawns), it's not a mistake
   *
   * @param evalAfter - Evaluation after the move (from White's perspective)
   * @param isWhiteMove - Whether this is white's move
   */
  private _shouldSkipStillWinning(evalAfter?: number, isWhiteMove?: boolean): boolean {
    if (!MISTAKE_THRESHOLDS.ENABLE_STILL_WINNING_LENIENCY) return false;
    if (evalAfter === undefined || isWhiteMove === undefined) return false;

    // Get eval from player's perspective
    const playerEval = isWhiteMove ? evalAfter : -evalAfter;

    // If player is still winning by a lot, don't call it a mistake
    return playerEval >= MISTAKE_THRESHOLDS.STILL_WINNING_THRESHOLD;
  }

  /**
   * Classify as generic mistake if in range
   */
  private _classifyGenericMistake(centipawnLoss: number): MistakeResult {
    if (centipawnLoss >= MISTAKE_THRESHOLDS.MIN_CP_LOSS &&
        centipawnLoss < MISTAKE_THRESHOLDS.MAX_CP_LOSS) {
      return {
        isMistake: true,
        type: MistakeType.GENERAL,
        reason: 'Move loses significant evaluation',
        centipawnLoss,
        severity: this._getSeverity(centipawnLoss),
        suggestedMarker: MarkerType.MISTAKE,
      };
    }
    return { isMistake: false, centipawnLoss };
  }

  /**
   * Get severity based on centipawn loss
   */
  private _getSeverity(cpLoss: number): 'light' | 'moderate' | 'serious' {
    if (cpLoss >= 220) return 'serious';
    if (cpLoss >= 180) return 'moderate';
    return 'light';
  }
}

// Export singleton for easy usage
export const mistakeDetector = new MistakeDetector();

