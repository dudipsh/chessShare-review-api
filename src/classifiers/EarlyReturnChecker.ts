/**
 * Checks for early returns in move classification
 * e.g., checkmate moves
 */

import { MarkerType, type ExtendedChessMove } from '../types/index.js';

export class EarlyReturnChecker {
  /**
   * Check for early returns (checkmate, NAGs, etc.)
   * Returns classification or null if move needs full analysis
   */
  check(
    playedMove: ExtendedChessMove
  ): { markerType: MarkerType; centipawnLoss: number } | null {
    // ⚠️ NAGs DISABLED: Don't use existing annotations from external sources
    // We want to do our OWN analysis

    // Check checkmate
    if (playedMove.san.includes('#')) {
      return { markerType: MarkerType.BEST, centipawnLoss: 0 };
    }

    return null;
  }
}


