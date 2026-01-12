/**
 * Checks if player maintains mate despite mistakes
 */

import { EvaluationUtils } from './EvaluationUtils.js';
import { MarkerType } from '../types/index.js';
import { getMarkerTypeByLoss } from '../config/constants.js';

export class MateSafetyChecker {
  /**
   * If player has mate, mistakes are downgraded to GOOD
   * (position is still winning despite the mistake)
   */
  checkMateSafety(
    evalAfter: number,
    isWhiteMove: boolean,
    centipawnLoss: number
  ): { markerType: MarkerType; centipawnLoss: number } | null {
    if (!EvaluationUtils.isMateScore(evalAfter)) return null;

    const mateIn = EvaluationUtils.extractMateIn(evalAfter);
    if (mateIn === null) return null;

    // ⚠️ CRITICAL FIX: Check if player is WINNING (has mate advantage)
    const isMateForPlayer = isWhiteMove ? mateIn > 0 : mateIn < 0;
    if (!isMateForPlayer) {
      // ⚠️ Player is LOSING (mate against them) - this should be a BLUNDER!
      return { markerType: MarkerType.BLUNDER, centipawnLoss };
    }

    // Only apply safety if player is WINNING (has mate advantage)
    const preliminaryType = getMarkerTypeByLoss(centipawnLoss);
    if (
      [MarkerType.MISTAKE, MarkerType.BLUNDER, MarkerType.INACCURACY].includes(
        preliminaryType
      )
    ) {
      return { markerType: MarkerType.GOOD, centipawnLoss };
    }

    return { markerType: preliminaryType, centipawnLoss };
  }
}


