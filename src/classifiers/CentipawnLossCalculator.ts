/**
 * Calculates centipawn loss with adjustments for game phase and position
 * Full implementation with all adjustments from MoveClassificationService
 */

import {
  ACCURACY_ADJUSTMENT,
  LOSING_POSITION_ADJUSTMENT,
  isMateScore,
  extractMateIn,
} from '../config/constants.js';

interface CentipawnContext {
  evalBefore: number;
  evalAfter: number;
  evalIfBestMove: number;
  isWhiteMove: boolean;
  isEvalIfBestUnreliable: boolean;
  isInTopMoves: boolean; // ✅ NEW: Track if move is in top moves
  fenAfter: string;
  moveNumber?: number;
  gameWinner?: 'white' | 'black' | 'draw' | null;
  playedMove?: any;
}

export class CentipawnLossCalculator {
  /**
   * Calculate centipawn loss with all adjustments
   * ✅ FIXED: Always use actual evaluation change, not topMoves comparison
   */
  calculate(ctx: CentipawnContext): number {
    // ⚠️ CRITICAL: If evalIfBestMove is unreliable, handle specially
    if (ctx.isEvalIfBestUnreliable) {
      return this._handleUnreliableEval(ctx);
    }

    // ✅ FIXED: Calculate loss based on actual evaluation change
    // This ensures moves like h6 that drop eval from +0.7 to +0.1 are properly penalized
    let loss: number;
    if (ctx.isWhiteMove) {
      // For white: loss = best eval - actual eval after move
      loss = Math.max(0, ctx.evalIfBestMove - ctx.evalAfter);
    } else {
      // For black: loss = actual eval after move - best eval (inverted perspective)
      loss = Math.max(0, ctx.evalAfter - ctx.evalIfBestMove);
    }

    // Cap centipawn loss only for extreme mate scores (10+ pawns = likely mate)
    // DO NOT cap at lower values - we need real cpLoss for accurate classification
    const MAX_REASONABLE_LOSS = 1000; // 10 pawns - only affects mate positions
    if (loss > MAX_REASONABLE_LOSS) {
      loss = MAX_REASONABLE_LOSS;
    }

    // ✅ Apply losing position adjustment
    if (loss < LOSING_POSITION_ADJUSTMENT.MAX_LOSS_FOR_PENALTY) {
      loss = this._applyLosingPositionAdjustment(loss, ctx);
    }

    // ⭐ Apply winner/loser adjustment
    loss = this._applyWinnerLoserAdjustment(loss, ctx);

    return loss;
  }

  /**
   * Handle unreliable evaluation (move not in topMoves)
   */
  private _handleUnreliableEval(ctx: CentipawnContext): number {
    // ✅ CRITICAL FIX: If move is in top moves, give it special treatment even if unreliable!
    if (ctx.isInTopMoves) {
      // Calculate improvement
      const rawChange = ctx.evalAfter - ctx.evalBefore;
      const improvement = ctx.isWhiteMove ? rawChange : -rawChange;
      
      // Return raw loss - forgiveness is applied in MoveClassificationService
      // ⚠️ DO NOT apply forgiveness here to avoid double application!
      return Math.max(0, Math.abs(improvement));
    }

    // ✅ Check if this involves mate positions
    if (isMateScore(ctx.evalBefore) || isMateScore(ctx.evalAfter)) {
      const mateBefore = extractMateIn(ctx.evalBefore);
      const mateAfter = extractMateIn(ctx.evalAfter);

      if (mateBefore !== null && mateAfter !== null) {
        const isMateForPlayer = ctx.isWhiteMove ? mateAfter > 0 : mateAfter < 0;

        if (isMateForPlayer) {
          const beforeDist = Math.abs(mateBefore);
          const afterDist = Math.abs(mateAfter);
          if (afterDist <= beforeDist) {
            return 0; // BEST move - mate in fewer moves!
          }
        }
      }
    }

    // Calculate improvement
    const rawChange = ctx.evalAfter - ctx.evalBefore;
    const improvement = ctx.isWhiteMove ? rawChange : -rawChange;

    // Use the actual centipawn loss based on improvement
    // Only cap for extreme mate scores
    let centipawnLoss = Math.abs(improvement);
    
    // Cap only for extreme values (mate positions)
    const MAX_REASONABLE_LOSS = 1000; // 10 pawns
    if (centipawnLoss > MAX_REASONABLE_LOSS) {
      centipawnLoss = MAX_REASONABLE_LOSS;
    }
    
    return centipawnLoss;
  }

  /**
   * Apply losing position adjustment
   */
  private _applyLosingPositionAdjustment(
    loss: number,
    ctx: CentipawnContext
  ): number {
    const playerEval = ctx.isWhiteMove ? ctx.evalAfter : -ctx.evalAfter;
    const improvement = ctx.isWhiteMove
      ? ctx.evalAfter - ctx.evalBefore
      : ctx.evalBefore - ctx.evalAfter;

    if (playerEval < LOSING_POSITION_ADJUSTMENT.THRESHOLD && improvement <= 0) {
      return LOSING_POSITION_ADJUSTMENT.PENALTY;
    }

    return loss;
  }

  /**
   * Apply winner/loser adjustment
   * ⭐ CRITICAL: Winners get strict penalties, losers get forgiveness
   */
  private _applyWinnerLoserAdjustment(
    loss: number,
    ctx: CentipawnContext
  ): number {
    if (!ctx.gameWinner || ctx.gameWinner === 'draw') {
      return loss;
    }

    const isWinner =
      (ctx.gameWinner === 'white' && ctx.isWhiteMove) ||
      (ctx.gameWinner === 'black' && !ctx.isWhiteMove);


    const originalLoss = loss;

    if (isWinner) {
      // ✅ CRITICAL FIX: Only apply penalty if there's actual loss (not perfect moves!)
      if (loss > 0) {
        // ⭐ WINNER PENALTY: Increase centipawn loss
        const afterPenalty = Math.round(
          loss * ACCURACY_ADJUSTMENT.WINNER_PENALTY
        );
        loss = afterPenalty;
      } else {
      }
    } else {
      // ✅ CRITICAL FIX: Only apply penalty if there's actual loss (not perfect moves!)
      if (loss > 0) {
        // ⚠️ LOSER PENALTY: Increase centipawn loss EVEN MORE
        const afterPenalty = Math.round(loss * ACCURACY_ADJUSTMENT.LOSER_PENALTY);
        loss = afterPenalty;
      } else {
      }
    }

    return loss;
  }

  /**
   * Check if position is a critical endgame
   */
  private _isCriticalEndgame(fen: string): boolean {
    const totalMaterial = this._getMaterialCount(fen);
    if (totalMaterial < 0) return false;
    return totalMaterial <= 24;
  }

  /**
   * Get total material count from FEN
   */
  private _getMaterialCount(fen: string): number {
    if (!fen || fen === 'N/A') return -1;

    try {
      const pieces = fen.split(' ')[0];
      const queens = (pieces.match(/[Qq]/g) || []).length;
      const rooks = (pieces.match(/[Rr]/g) || []).length;
      const bishops = (pieces.match(/[Bb]/g) || []).length;
      const knights = (pieces.match(/[Nn]/g) || []).length;
      return queens * 9 + rooks * 5 + bishops * 3 + knights * 3;
    } catch (e) {
      return -1;
    }
  }
}
