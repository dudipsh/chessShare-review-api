/**
 * Classifies moves that are in Stockfish's top 3
 */

import { MarkerType } from '../types/index.js';
import { MOVE_CLASSIFICATION_THRESHOLDS } from '../config/constants.js';

export class TopMovesClassifier {
  /**
   * Classify a move that's in top 3
   * Handles special cases like inconsistent analysis
   */
  classifyTopMove(
    playedMoveIndex: number,
    adjustedCpLoss: number,
    topMoves: Array<{ uci: string; cp: number }>
  ): { markerType: MarkerType; centipawnLoss: number } {
    const bestMoveData = topMoves[0];
    const playedMoveData = topMoves[playedMoveIndex];

    // ⚠️ SPECIAL CASE: Best move (#1) with inconsistent analysis
    if (playedMoveIndex === 0) {
      const cpDifference = Math.abs(bestMoveData.cp - playedMoveData.cp);

      if (cpDifference > 100) {
        // Huge difference - Stockfish analysis was inconsistent!
        return this._classifyByCpLoss(adjustedCpLoss);
      }

      // 🔧 FIX: Much more lenient for THE best move!
      // If you played the #1 best move from Stockfish's analysis,
      // you should get "best" unless there's a HUGE evaluation drop (100+ cp)
      // This fixes the bug where best moves were marked as inaccuracy due to depth differences
      const BEST_MOVE_TOLERANCE = 100; // 100cp tolerance for the best move

      if (adjustedCpLoss <= BEST_MOVE_TOLERANCE) {
        // 🔧 If cpLoss is small (< 50), it's definitely BEST
        // If cpLoss is medium (50-100), it's still BEST but we note the loss
        const effectiveCpLoss = Math.min(adjustedCpLoss, MOVE_CLASSIFICATION_THRESHOLDS.BEST);
        return { markerType: MarkerType.BEST, centipawnLoss: effectiveCpLoss };
      }

      // Only if cpLoss > 100 for the "best" move do we reclassify
      // This means something is seriously wrong with the analysis or position
      return {
        markerType: this._getMarkerByLoss(adjustedCpLoss),
        centipawnLoss: adjustedCpLoss,
      };
    }

    // 🔧 FIX: Also be more lenient for #2 move
    if (playedMoveIndex === 1) {
      // Second best move - if cpLoss is small, still classify as GOOD or BEST
      if (adjustedCpLoss <= MOVE_CLASSIFICATION_THRESHOLDS.GOOD) {
        return { markerType: MarkerType.GOOD, centipawnLoss: adjustedCpLoss };
      }
    }

    // ✅ FIXED: Remove harsh rule for #3 moves - they should be treated normally
    // Top 3 moves are all good moves, even if #3 has some loss
    // The centipawn loss calculation will handle the classification properly

    // Top 3 move classification by centipawn loss
    return this._classifyByCpLoss(adjustedCpLoss);
  }

  /**
   * Classify top 3 move by centipawn loss
   */
  private _classifyByCpLoss(cpLoss: number): {
    markerType: MarkerType;
    centipawnLoss: number;
  } {
    // ✅ Use the centralized classification function
    const markerType = this._getMarkerByLoss(cpLoss);
    return { markerType, centipawnLoss: cpLoss };
  }

  /**
   * Get marker type by centipawn loss
   * ⚠️ Order matters! MISS comes BEFORE MISTAKE
   */
  private _getMarkerByLoss(cpLoss: number): MarkerType {
    if (cpLoss <= MOVE_CLASSIFICATION_THRESHOLDS.BEST) {
      return MarkerType.BEST;
    }
    if (cpLoss <= MOVE_CLASSIFICATION_THRESHOLDS.GOOD) {
      return MarkerType.GOOD;
    }
    if (cpLoss <= MOVE_CLASSIFICATION_THRESHOLDS.INACCURACY) {
      return MarkerType.INACCURACY;
    }
    if (cpLoss <= MOVE_CLASSIFICATION_THRESHOLDS.MISS) {
      return MarkerType.MISS; // Missed opportunity (100-150cp)
    }
    if (cpLoss <= MOVE_CLASSIFICATION_THRESHOLDS.MISTAKE) {
      return MarkerType.MISTAKE; // Clear mistake (150-300cp)
    }
    return MarkerType.BLUNDER;
  }
}
