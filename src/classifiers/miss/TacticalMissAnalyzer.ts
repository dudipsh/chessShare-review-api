/**
 * Tactical Miss Analyzer
 * Detects when a player misses a tactical opportunity
 * 
 * A tactical miss is when the best move was a tactical shot
 * (capture, check, fork, etc.) but the player played differently.
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { MarkerType } from '../../types/index.js';
import { MISS_THRESHOLDS, MissType, MissResult } from './MissThresholds.js';

export class TacticalMissAnalyzer {
  /**
   * Analyze if player missed a tactical opportunity
   * 
   * @param move - The move actually played
   * @param centipawnLoss - How much evaluation was lost
   * @param bestMove - The best move (if known)
   * @param bestMoveWasCapture - Whether best move was a capture
   * @param bestMoveWasCheck - Whether best move was a check
   * @returns MissResult indicating if it was a miss
   */
  analyzeTacticalMiss(
    move: ExtendedChessMove,
    centipawnLoss: number,
    bestMove?: string,
    bestMoveWasCapture?: boolean,
    bestMoveWasCheck?: boolean
  ): MissResult {
    // Check if loss is in miss range
    if (centipawnLoss < MISS_THRESHOLDS.MIN_CP_LOSS ||
        centipawnLoss >= MISS_THRESHOLDS.MAX_CP_LOSS) {
      return { isMiss: false, centipawnLoss };
    }

    // If we require tactical best move, check if best move was tactical
    if (MISS_THRESHOLDS.REQUIRE_TACTICAL_BEST_MOVE) {
      if (!bestMoveWasCapture && !bestMoveWasCheck && !this._looksTactical(bestMove)) {
        return { isMiss: false, centipawnLoss };
      }
    }

    // Check for missed capture
    if (bestMoveWasCapture && !this._isCapture(move)) {
      if (centipawnLoss >= MISS_THRESHOLDS.MISSED_CAPTURE_THRESHOLD) {
        return {
          isMiss: true,
          type: MissType.MISSED_CAPTURE,
          reason: 'Missed winning capture',
          centipawnLoss,
          missedMoveWas: bestMove,
          suggestedMarker: MarkerType.MISS,
        };
      }
    }

    // Check for missed check
    if (bestMoveWasCheck && !this._isCheck(move)) {
      if (centipawnLoss >= MISS_THRESHOLDS.MISSED_CHECK_THRESHOLD) {
        return {
          isMiss: true,
          type: MissType.MISSED_CHECK,
          reason: 'Missed strong check',
          centipawnLoss,
          missedMoveWas: bestMove,
          suggestedMarker: MarkerType.MISS,
        };
      }
    }

    // Check for missed capture with check (very strong)
    if (bestMoveWasCapture && bestMoveWasCheck) {
      return {
        isMiss: true,
        type: MissType.MISSED_COMBINATION,
        reason: 'Missed capture with check',
        centipawnLoss,
        missedMoveWas: bestMove,
        suggestedMarker: MarkerType.MISS,
      };
    }

    // Generic tactical miss
    if (this._looksTactical(bestMove) && !this._looksTactical(move.san)) {
      return {
        isMiss: true,
        type: MissType.TACTICAL,
        reason: 'Missed tactical opportunity',
        centipawnLoss,
        missedMoveWas: bestMove,
        suggestedMarker: MarkerType.MISS,
      };
    }

    return { isMiss: false, centipawnLoss };
  }

  /**
   * Analyze for missed fork
   */
  analyzeMissedFork(
    move: ExtendedChessMove,
    centipawnLoss: number,
    bestMoveWasFork: boolean
  ): MissResult {
    if (!bestMoveWasFork) {
      return { isMiss: false, centipawnLoss };
    }

    if (centipawnLoss >= MISS_THRESHOLDS.MISSED_FORK_THRESHOLD &&
        centipawnLoss < MISS_THRESHOLDS.MAX_CP_LOSS) {
      return {
        isMiss: true,
        type: MissType.MISSED_FORK,
        reason: 'Missed forking opportunity',
        centipawnLoss,
        suggestedMarker: MarkerType.MISS,
      };
    }

    return { isMiss: false, centipawnLoss };
  }

  /**
   * Check if move is a capture
   */
  private _isCapture(move: ExtendedChessMove): boolean {
    return move.san?.includes('x') || !!move.captured;
  }

  /**
   * Check if move is a check
   */
  private _isCheck(move: ExtendedChessMove): boolean {
    return move.san?.includes('+') || false;
  }

  /**
   * Check if move looks tactical (capture, check, or promotion)
   */
  private _looksTactical(san?: string): boolean {
    if (!san) return false;
    return san.includes('x') || san.includes('+') || san.includes('=');
  }
}

