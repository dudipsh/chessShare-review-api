/**
 * Check Move Analyzer
 * Detects and evaluates check moves for great move classification
 * 
 * Check moves are inherently forcing and tactical - they must be responded to.
 * A check that maintains or improves the position is a strong tactical move.
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { GREAT_MOVE_THRESHOLDS, GreatMoveType, GreatMoveResult } from './GreatMoveThresholds.js';

export class CheckMoveAnalyzer {
  /**
   * Analyze if a check move qualifies as a great move
   * 
   * @param move - The chess move with SAN notation
   * @param centipawnLoss - How much evaluation was lost vs best move
   * @param evalBefore - Position evaluation before the move
   * @param evalAfter - Position evaluation after the move
   * @returns GreatMoveResult indicating if move is great
   */
  analyzeCheck(
    move: ExtendedChessMove,
    centipawnLoss: number,
    evalBefore?: number,
    evalAfter?: number
  ): GreatMoveResult {
    // Only analyze check moves
    if (!this._isCheck(move)) {
      return { isGreat: false, centipawnLoss };
    }

    // Check if it's also a capture (higher priority type)
    const isCapture = this._isCapture(move);
    
    if (isCapture && GREAT_MOVE_THRESHOLDS.CAPTURE_WITH_CHECK_BONUS) {
      // Capture with check - very strong tactical pattern
      if (centipawnLoss <= GREAT_MOVE_THRESHOLDS.CAPTURE_CHECK_MAX_CP_LOSS) {
        return {
          isGreat: true,
          type: GreatMoveType.CAPTURE_CHECK,
          reason: 'Capture with check - forcing tactical sequence',
          centipawnLoss,
        };
      }
    }

    // Regular check - must be close to best move
    if (centipawnLoss <= GREAT_MOVE_THRESHOLDS.CHECK_MAX_CP_LOSS) {
      // Verify the check doesn't worsen position significantly
      if (evalBefore !== undefined && evalAfter !== undefined) {
        const evalChange = evalAfter - evalBefore;
        if (evalChange >= GREAT_MOVE_THRESHOLDS.CHECK_MIN_EVAL_GAIN) {
          return {
            isGreat: true,
            type: GreatMoveType.CHECK,
            reason: 'Forcing check that maintains/improves position',
            centipawnLoss,
          };
        }
      } else {
        // No eval data - rely on centipawn loss alone
        return {
          isGreat: true,
          type: GreatMoveType.CHECK,
          reason: 'Forcing check near best move',
          centipawnLoss,
        };
      }
    }

    return { isGreat: false, centipawnLoss };
  }

  /**
   * Check if move is a check ('+' in SAN notation)
   */
  private _isCheck(move: ExtendedChessMove): boolean {
    return move.san?.includes('+') || false;
  }

  /**
   * Check if move is a capture
   */
  private _isCapture(move: ExtendedChessMove): boolean {
    return move.san?.includes('x') || !!move.captured;
  }

  /**
   * Check if the check is part of a trivial mate sequence
   * (to avoid marking obvious checks as "great")
   */
  isTrivialMateCheck(
    move: ExtendedChessMove,
    evalAfter?: number,
    mateIn?: number
  ): boolean {
    if (!GREAT_MOVE_THRESHOLDS.REJECT_TRIVIAL_MATE_CHECKS) return false;
    
    // If it's mate-in-1 or mate-in-2, the check is trivial
    if (mateIn !== undefined && mateIn <= 2) {
      return true;
    }

    // If evaluation is extremely winning (+/-10000), likely trivial
    if (evalAfter !== undefined && Math.abs(evalAfter) >= 10000) {
      return true;
    }

    return false;
  }
}

