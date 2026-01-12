/**
 * BestMoveClassifier - Detects truly optimal moves ($1 / !)
 * A move is BEST when it has minimal centipawn loss and matches engine's top choice
 */

import { MOVE_CLASSIFICATION_THRESHOLDS } from '../config/constants.js';

export interface BestMoveInput {
  centipawnLoss: number;
  playedMoveUci: string;
  bestMoveUci: string;
  isInTopMoves: boolean;
}

export interface BestMoveResult {
  isBest: boolean;
  reason?: string;
}

export class BestMoveClassifier {
  /**
   * Check if a move qualifies as BEST ($1 / !)
   */
  isBest(input: BestMoveInput): BestMoveResult {
    const { centipawnLoss, playedMoveUci, bestMoveUci, isInTopMoves } = input;

    // Move must have minimal centipawn loss
    if (centipawnLoss > MOVE_CLASSIFICATION_THRESHOLDS.BEST) {
      return { isBest: false };
    }

    // Move must be the engine's best move or in top moves
    const isEngineBest = playedMoveUci.toLowerCase() === bestMoveUci.toLowerCase();

    if (isEngineBest) {
      return { isBest: true, reason: 'engine_best' };
    }

    if (isInTopMoves && centipawnLoss <= 5) {
      return { isBest: true, reason: 'top_move_minimal_loss' };
    }

    return { isBest: false };
  }
}

// Singleton instance
export const bestMoveClassifier = new BestMoveClassifier();
