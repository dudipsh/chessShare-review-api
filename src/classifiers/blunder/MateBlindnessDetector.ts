/**
 * Mate Blindness Detector
 * Detects blunders caused by missing checkmate threats
 * 
 * Mate blindness is when a player misses either:
 * 1. A checkmate threat from the opponent
 * 2. A checkmate opportunity for themselves
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { MarkerType } from '../../types/index.js';
import { BLUNDER_THRESHOLDS, BlunderType, BlunderResult } from './BlunderThresholds.js';

export class MateBlindnessDetector {
  /**
   * Analyze if move demonstrates mate blindness
   * 
   * @param move - The chess move
   * @param centipawnLoss - How much evaluation was lost
   * @param evalBefore - Position evaluation before move
   * @param evalAfter - Position evaluation after move
   * @param mateInBefore - Mate-in count before move (if any)
   * @param mateInAfter - Mate-in count after move (if any)
   * @returns BlunderResult indicating if move shows mate blindness
   */
  analyzeMateBlindness(
    move: ExtendedChessMove,
    centipawnLoss: number,
    evalBefore?: number,
    evalAfter?: number,
    mateInBefore?: number,
    mateInAfter?: number
  ): BlunderResult {
    // Must be at least blunder threshold
    if (centipawnLoss < BLUNDER_THRESHOLDS.MIN_CP_LOSS) {
      return { isBlunder: false, centipawnLoss };
    }

    // Check for missing opponent's mate threat
    const missedThreatResult = this._checkMissedMateThreat(
      move,
      centipawnLoss,
      evalBefore,
      evalAfter,
      mateInAfter
    );
    if (missedThreatResult.isBlunder) return missedThreatResult;

    // Check for missing own checkmate opportunity
    const missedOppResult = this._checkMissedMateOpportunity(
      move,
      centipawnLoss,
      evalBefore,
      evalAfter,
      mateInBefore
    );
    if (missedOppResult.isBlunder) return missedOppResult;

    // Check for general mate-related eval collapse
    const evalCollapseResult = this._checkMateEvalCollapse(
      move,
      centipawnLoss,
      evalBefore,
      evalAfter
    );
    if (evalCollapseResult.isBlunder) return evalCollapseResult;

    return { isBlunder: false, centipawnLoss };
  }

  /**
   * Check if player missed opponent's mate threat
   */
  private _checkMissedMateThreat(
    move: ExtendedChessMove,
    centipawnLoss: number,
    evalBefore?: number,
    evalAfter?: number,
    mateInAfter?: number
  ): BlunderResult {
    if (!BLUNDER_THRESHOLDS.MISSED_MATE_THREAT) {
      return { isBlunder: false, centipawnLoss };
    }

    // If after the move there's a forced mate for opponent (negative mate)
    if (mateInAfter !== undefined && mateInAfter < 0) {
      const movesToMate = Math.abs(mateInAfter);
      if (movesToMate <= BLUNDER_THRESHOLDS.MATE_THREAT_MAX_MOVES) {
        return {
          isBlunder: true,
          type: BlunderType.MATE_BLINDNESS,
          reason: `Move allows mate in ${movesToMate}`,
          centipawnLoss,
          severity: 'critical',
          suggestedMarker: MarkerType.BLUNDER,
        };
      }
    }

    // Check for eval swing that indicates getting mated
    if (evalBefore !== undefined && evalAfter !== undefined) {
      // Evaluation went from "okay" to "mate" (very negative = mating threat)
      if (evalBefore >= -200 && evalAfter <= -10000) {
        return {
          isBlunder: true,
          type: BlunderType.MATE_BLINDNESS,
          reason: 'Move walks into checkmate',
          centipawnLoss,
          severity: 'critical',
          suggestedMarker: MarkerType.BLUNDER,
        };
      }
    }

    return { isBlunder: false, centipawnLoss };
  }

  /**
   * Check if player missed their own checkmate opportunity
   */
  private _checkMissedMateOpportunity(
    move: ExtendedChessMove,
    centipawnLoss: number,
    evalBefore?: number,
    evalAfter?: number,
    mateInBefore?: number
  ): BlunderResult {
    // If there was a winning mate before the move but now it's gone
    if (mateInBefore !== undefined && mateInBefore > 0) {
      // Player had mate in X and threw it away
      if (mateInBefore <= BLUNDER_THRESHOLDS.MATE_THREAT_MAX_MOVES) {
        return {
          isBlunder: true,
          type: BlunderType.MATE_BLINDNESS,
          reason: `Missed mate in ${mateInBefore}`,
          centipawnLoss,
          severity: 'critical',
          suggestedMarker: MarkerType.BLUNDER,
        };
      }
    }

    // Check for eval swing from winning to not-winning
    if (evalBefore !== undefined && evalAfter !== undefined) {
      // Had overwhelming advantage (+10000 = mate) and lost it
      if (evalBefore >= 10000 && evalAfter < 5000) {
        return {
          isBlunder: true,
          type: BlunderType.MATE_BLINDNESS,
          reason: 'Missed winning checkmate sequence',
          centipawnLoss,
          severity: 'critical',
          suggestedMarker: MarkerType.BLUNDER,
        };
      }
    }

    return { isBlunder: false, centipawnLoss };
  }

  /**
   * Check for general evaluation collapse related to mate threats
   */
  private _checkMateEvalCollapse(
    move: ExtendedChessMove,
    centipawnLoss: number,
    evalBefore?: number,
    evalAfter?: number
  ): BlunderResult {
    if (evalBefore === undefined || evalAfter === undefined) {
      return { isBlunder: false, centipawnLoss };
    }

    const evalSwing = evalBefore - evalAfter;
    
    // Massive eval swing (game-turning blunder)
    if (evalSwing >= BLUNDER_THRESHOLDS.MATE_BLINDNESS_EVAL_SWING) {
      // Check if it's specifically mate-related (eval near mate values)
      if (Math.abs(evalAfter) >= 10000 || Math.abs(evalBefore) >= 10000) {
        return {
          isBlunder: true,
          type: BlunderType.MATE_BLINDNESS,
          reason: 'Critical evaluation collapse related to mate',
          centipawnLoss,
          severity: 'critical',
          suggestedMarker: MarkerType.BLUNDER,
        };
      }
    }

    return { isBlunder: false, centipawnLoss };
  }
}

