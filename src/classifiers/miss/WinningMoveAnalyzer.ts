/**
 * Winning Move Analyzer
 * Detects when a player misses a winning move or sequence
 * 
 * A winning move miss is when the player had a crushing continuation
 * but played a move that's still good but not as decisive.
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { MarkerType } from '../../types/index.js';
import { MISS_THRESHOLDS, MissType, MissResult } from './MissThresholds.js';

export class WinningMoveAnalyzer {
  /**
   * Analyze if player missed a winning move
   * 
   * @param move - The move actually played
   * @param centipawnLoss - How much evaluation was lost
   * @param evalBefore - Position evaluation before move
   * @param evalAfter - Position evaluation after move
   * @param bestMoveEval - Evaluation after best move (if known)
   * @returns MissResult indicating if it was a miss
   */
  analyzeWinningMiss(
    move: ExtendedChessMove,
    centipawnLoss: number,
    evalBefore?: number,
    evalAfter?: number,
    bestMoveEval?: number
  ): MissResult {
    // Check if loss is in miss range
    if (centipawnLoss < MISS_THRESHOLDS.MIN_CP_LOSS ||
        centipawnLoss >= MISS_THRESHOLDS.MAX_CP_LOSS) {
      return { isMiss: false, centipawnLoss };
    }

    // Skip if we can't determine position quality
    if (evalBefore === undefined) {
      return { isMiss: false, centipawnLoss };
    }

    // Skip if position wasn't clearly winning
    if (evalBefore < MISS_THRESHOLDS.WINNING_POSITION_THRESHOLD) {
      return { isMiss: false, centipawnLoss };
    }

    // Skip if already winning by a lot (no need to find the killer)
    if (MISS_THRESHOLDS.SKIP_IF_ALREADY_WINNING &&
        evalBefore >= MISS_THRESHOLDS.ALREADY_WINNING_THRESHOLD) {
      return { isMiss: false, centipawnLoss };
    }

    // Check if best move would have created crushing advantage
    if (bestMoveEval !== undefined) {
      const bestMoveGain = bestMoveEval - evalBefore;
      const actualGain = (evalAfter ?? evalBefore) - evalBefore;
      const missedGain = bestMoveGain - actualGain;

      // Player missed a move that would have significantly improved position
      if (bestMoveEval >= MISS_THRESHOLDS.CRUSHING_ADVANTAGE_THRESHOLD &&
          missedGain >= MISS_THRESHOLDS.MISSED_WINNING_SEQUENCE) {
        return {
          isMiss: true,
          type: MissType.MISSED_WINNING_MOVE,
          reason: 'Missed crushing continuation',
          centipawnLoss,
          suggestedMarker: MarkerType.MISS,
        };
      }
    }

    // Check for missed winning sequence (eval was high but didn't capitalize)
    if (evalAfter !== undefined) {
      const evalDrop = evalBefore - evalAfter;
      
      // Had big advantage but didn't convert optimally
      if (evalBefore >= MISS_THRESHOLDS.CRUSHING_ADVANTAGE_THRESHOLD &&
          evalDrop >= MISS_THRESHOLDS.MISSED_WINNING_SEQUENCE) {
        return {
          isMiss: true,
          type: MissType.MISSED_WINNING_MOVE,
          reason: 'Missed winning sequence in strong position',
          centipawnLoss,
          suggestedMarker: MarkerType.MISS,
        };
      }
    }

    return { isMiss: false, centipawnLoss };
  }

  /**
   * Check if the missed move would have ended the game
   * 
   * ✅ FIXED: Removed centipawn range check for mate sequences
   * When a player misses mate but is still winning, it should ALWAYS be MISS
   * regardless of how the centipawn loss is calculated (mate scores can cause
   * artificially high centipawn losses)
   */
  analyzeMissedGameEnder(
    move: ExtendedChessMove,
    centipawnLoss: number,
    mateInBest?: number,
    mateInPlayed?: number,
    evalAfterPlayed?: number // ✅ NEW: Position evaluation after played move
  ): MissResult {
    // If best was mate in X and played wasn't (or much longer mate)
    if (mateInBest !== undefined && mateInBest > 0) {
      // Player had mate but played move results in no mate or much longer mate
      if (mateInPlayed === undefined || mateInPlayed > mateInBest + 2) {
        // ✅ CRITICAL: Check if position is still winning after the move
        // If still winning (eval >= 500cp or still has mate) → MISS
        // If position became bad (eval < 0) → This will be handled as BLUNDER by other classifiers
        const stillWinning = evalAfterPlayed !== undefined && evalAfterPlayed >= 500;
        const stillHasMate = mateInPlayed !== undefined && mateInPlayed > 0;
        
        if (stillWinning || stillHasMate) {
          return {
            isMiss: true,
            type: MissType.MISSED_WINNING_MOVE,
            reason: `Missed mate in ${mateInBest}`,
            centipawnLoss,
            suggestedMarker: MarkerType.MISS,
          };
        }
        
        // If position became neutral/losing, let other classifiers handle it
        // (might be BLUNDER if went from winning to losing)
      }
    }

    return { isMiss: false, centipawnLoss };
  }
}

