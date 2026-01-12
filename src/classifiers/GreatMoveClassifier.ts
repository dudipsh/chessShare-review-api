/**
 * Classifies "Great Moves" (Chess.com style)
 * EXPANDED: Forcing tactical moves including checks AND strong captures
 */

import type { ExtendedChessMove } from '../types/index.js';

const GREAT_MOVE_THRESHOLDS = {
  MAX_DELTA: 25, // ✅ RELAXED: Increased from 15 to 25cp for more flexibility
  MAX_DELTA_FOR_CAPTURES: 30, // ✅ NEW: Allow slightly more loss for tactical captures
};

export class GreatMoveClassifier {
  /**
   * Check if move qualifies as "Great"
   * ✅ EXPANDED: Now includes forcing checks AND tactical captures
   */
  isGreatMove(
    move: ExtendedChessMove,
    centipawnLoss: number
  ): boolean {
    const hasCheck = move.san.includes('+');
    const isCapture = move.san.includes('x') || move.captured;
    
    // ✅ CHECK moves can be GREAT (forcing moves)
    // Example: Ne2+ (forcing check that creates tactical complications)
    if (hasCheck && centipawnLoss <= GREAT_MOVE_THRESHOLDS.MAX_DELTA) {
      return true;
    }

    // ✅ TACTICAL CAPTURES can be GREAT (winning material or creating threats)
    // Example: Bxf7+ (capturing with check), Rxe4 (winning piece)
    if (isCapture && centipawnLoss <= GREAT_MOVE_THRESHOLDS.MAX_DELTA_FOR_CAPTURES) {
      // Additional criteria for captures to be "great":
      // 1. Very close to best move (low centipawn loss)
      // 2. Either has check OR captures valuable piece
      
      if (hasCheck) {
        // Tactical capture with check is definitely great
        return true;
      }
      
      // Regular capture needs to be closer to best
      if (centipawnLoss <= GREAT_MOVE_THRESHOLDS.MAX_DELTA) {
        return true;
      }
    }

    return false;
  }
}