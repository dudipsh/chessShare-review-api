/**
 * Blunder Detector
 * Main orchestrator for detecting "Blunder" moves
 * 
 * Blunders are critical mistakes that lose 2.5+ pawns worth of evaluation.
 * They typically involve:
 * - Hanging pieces (leaving valuable pieces undefended)
 * - Mate blindness (missing checkmate threats)
 * - Complete tactical disasters
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { MarkerType } from '../../types/index.js';
import { HangingPieceDetector } from './HangingPieceDetector.js';
import { MateBlindnessDetector } from './MateBlindnessDetector.js';
import { BLUNDER_THRESHOLDS, BlunderType, BlunderResult } from './BlunderThresholds.js';

/**
 * Context for blunder detection
 */
export interface BlunderContext {
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
  /** Mate-in count before the move (if any) */
  mateInBefore?: number;
  /** Mate-in count after the move (if any) */
  mateInAfter?: number;
  /** Whether position was already lost */
  isAlreadyLost?: boolean;
  /** Whether this is white's move (needed for still-winning leniency) */
  isWhiteMove?: boolean;
}

export class BlunderDetector {
  private _hangingPieceDetector = new HangingPieceDetector();
  private _mateBlindnessDetector = new MateBlindnessDetector();

  /**
   * Main entry point - detect if a move is a "Blunder"
   * 
   * @param ctx - Context with move and evaluation data
   * @returns BlunderResult with classification details
   */
  isBlunder(ctx: BlunderContext): BlunderResult {
    const {
      move,
      centipawnLoss,
      evalBefore,
      evalAfter,
      moveNumber,
      mateInBefore,
      mateInAfter,
      isAlreadyLost,
      isWhiteMove,
    } = ctx;

    // Early rejection: Not enough loss for blunder
    if (centipawnLoss < BLUNDER_THRESHOLDS.MIN_CP_LOSS) {
      return { isBlunder: false, centipawnLoss };
    }

    // Early rejection: Already in completely lost position
    if (this._shouldSkipAlreadyLost(evalBefore, isAlreadyLost)) {
      return { isBlunder: false, centipawnLoss };
    }

    // Early rejection: In forced mate sequence
    if (BLUNDER_THRESHOLDS.IGNORE_IN_FORCED_MATE && this._isInForcedMate(mateInBefore)) {
      return { isBlunder: false, centipawnLoss };
    }

    // Early rejection: Too early in game
    if (moveNumber !== undefined && moveNumber < BLUNDER_THRESHOLDS.MIN_MOVE_NUMBER) {
      return { isBlunder: false, centipawnLoss };
    }

    // ✅ NEW: Early rejection: Position is STILL winning after the move
    // Chess.com doesn't call it a blunder if you're still crushing
    if (this._shouldSkipStillWinning(evalAfter, isWhiteMove)) {
      return { isBlunder: false, centipawnLoss };
    }

    // Check for mate blindness first (most critical)
    const mateResult = this._mateBlindnessDetector.analyzeMateBlindness(
      move,
      centipawnLoss,
      evalBefore,
      evalAfter,
      mateInBefore,
      mateInAfter
    );
    if (mateResult.isBlunder) return mateResult;

    // Check for hanging pieces
    const hangingResult = this._hangingPieceDetector.analyzeHangingPiece(
      move,
      centipawnLoss,
      evalBefore,
      evalAfter
    );
    if (hangingResult.isBlunder) return hangingResult;

    // Check for game-turning blunder
    const gameTurningResult = this._checkGameTurning(
      move,
      centipawnLoss,
      evalBefore,
      evalAfter
    );
    if (gameTurningResult.isBlunder) return gameTurningResult;

    // Generic blunder classification if above threshold
    return this._classifyGenericBlunder(centipawnLoss);
  }

  /**
   * Legacy compatibility method
   */
  isBlunderMove(move: ExtendedChessMove, centipawnLoss: number): boolean {
    return this.isBlunder({ move, centipawnLoss }).isBlunder;
  }

  /**
   * Check if centipawn loss is in blunder range (quick check)
   */
  isInBlunderRange(centipawnLoss: number): boolean {
    return centipawnLoss >= BLUNDER_THRESHOLDS.MIN_CP_LOSS;
  }

  /**
   * Get the marker type for a blunder
   */
  getBlunderMarker(): MarkerType {
    return MarkerType.BLUNDER;
  }

  /**
   * Check for game-turning blunder (winning → losing)
   */
  private _checkGameTurning(
    move: ExtendedChessMove,
    centipawnLoss: number,
    evalBefore?: number,
    evalAfter?: number
  ): BlunderResult {
    if (evalBefore === undefined || evalAfter === undefined) {
      return { isBlunder: false, centipawnLoss };
    }

    // Was winning, now losing
    if (evalBefore >= BLUNDER_THRESHOLDS.WINNING_POSITION_THRESHOLD &&
        evalAfter <= BLUNDER_THRESHOLDS.LOSING_POSITION_THRESHOLD) {
      const swing = evalBefore - evalAfter;
      if (swing >= BLUNDER_THRESHOLDS.GAME_TURNING_SWING) {
        return {
          isBlunder: true,
          type: BlunderType.GAME_TURNING,
          reason: 'Game-turning blunder: winning to losing',
          centipawnLoss,
          severity: 'critical',
          suggestedMarker: MarkerType.BLUNDER,
        };
      }
    }

    // Was equal, now completely lost
    if (evalBefore >= -100 && evalBefore <= 100 &&
        evalAfter <= -BLUNDER_THRESHOLDS.WINNING_POSITION_THRESHOLD) {
      return {
        isBlunder: true,
        type: BlunderType.GAME_TURNING,
        reason: 'Game-turning blunder: equal to losing',
        centipawnLoss,
        severity: 'severe',
        suggestedMarker: MarkerType.BLUNDER,
      };
    }

    return { isBlunder: false, centipawnLoss };
  }

  /**
   * Check if should skip due to already lost position
   */
  private _shouldSkipAlreadyLost(evalBefore?: number, isAlreadyLost?: boolean): boolean {
    if (isAlreadyLost) return true;

    if (evalBefore !== undefined && evalBefore <= BLUNDER_THRESHOLDS.ALREADY_LOST_THRESHOLD) {
      return true;
    }

    return false;
  }

  /**
   * ✅ NEW: Check if should skip blunder because position is STILL winning
   * Chess.com style: if you're still crushing (+3 pawns), it's not a blunder
   *
   * @param evalAfter - Evaluation after the move (from White's perspective)
   * @param isWhiteMove - Whether this is white's move
   */
  private _shouldSkipStillWinning(evalAfter?: number, isWhiteMove?: boolean): boolean {
    if (!BLUNDER_THRESHOLDS.ENABLE_STILL_WINNING_LENIENCY) return false;
    if (evalAfter === undefined || isWhiteMove === undefined) return false;

    // Get eval from player's perspective
    const playerEval = isWhiteMove ? evalAfter : -evalAfter;

    // If player is still winning by a lot, don't call it a blunder
    return playerEval >= BLUNDER_THRESHOLDS.STILL_WINNING_THRESHOLD;
  }

  /**
   * Check if position is in forced mate sequence
   */
  private _isInForcedMate(mateInBefore?: number): boolean {
    if (mateInBefore === undefined) return false;
    // If there's already a forced mate against us, we're in forced mate
    return mateInBefore < 0;
  }

  /**
   * Generic blunder classification if above threshold
   */
  private _classifyGenericBlunder(centipawnLoss: number): BlunderResult {
    if (centipawnLoss >= BLUNDER_THRESHOLDS.MIN_CP_LOSS) {
      return {
        isBlunder: true,
        type: BlunderType.GENERAL,
        reason: 'Critical mistake losing significant evaluation',
        centipawnLoss,
        severity: this._getSeverity(centipawnLoss),
        suggestedMarker: MarkerType.BLUNDER,
      };
    }
    return { isBlunder: false, centipawnLoss };
  }

  /**
   * Get severity based on centipawn loss
   */
  private _getSeverity(cpLoss: number): 'critical' | 'severe' | 'serious' {
    if (cpLoss >= 700) return 'critical';
    if (cpLoss >= 400) return 'severe';
    return 'serious';
  }
}

// Export singleton for easy usage
export const blunderDetector = new BlunderDetector();

