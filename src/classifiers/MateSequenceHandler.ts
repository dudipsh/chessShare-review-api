/**
 * Handles mate sequence classification
 * Full implementation from MoveClassificationService
 */

import { Chess } from 'chess.js';
import { EvaluationUtils } from './EvaluationUtils.js';
import { MarkerType } from '../types/index.js';

interface MateContext {
  evalBefore: number;
  evalAfter: number;
  evalIfBestMove: number;
  isWhiteMove: boolean;
  fenBefore?: string;
  playedMove?: any;
}

export class MateSequenceHandler {
  /**
   * Check and classify mate sequences
   * Returns classification if it's a mate-related move, null otherwise
   */
  handleMateSequence(
    ctx: MateContext
  ): { markerType: MarkerType; centipawnLoss: number } | null {
    const { evalBefore, evalAfter, evalIfBestMove, isWhiteMove, fenBefore, playedMove } = ctx;
    

    // ⚠️ CRITICAL FIX: If we're ALREADY in a forced mate sequence (losing), DON'T classify moves!
    if (EvaluationUtils.isMateScore(evalBefore)) {
      const mateBefore = EvaluationUtils.extractMateIn(evalBefore);
      if (mateBefore !== null) {
        // ✅ FIXED: Correctly determine if player has mate based on their color
        // mateBefore > 0 means White has mate, < 0 means Black has mate
        const isMateForPlayer = (isWhiteMove && mateBefore > 0) || (!isWhiteMove && mateBefore < 0);

        // ⚠️ SPECIAL CASE: Check if this move DELIVERS checkmate
        if (playedMove && playedMove.san && playedMove.san.includes('#')) {
          return { markerType: MarkerType.BEST, centipawnLoss: 0 };
        }

        // ⚠️ SPECIAL CASE 2: If we were losing but turned it around
        if (!isMateForPlayer && EvaluationUtils.isMateScore(evalAfter)) {
          const mateAfter = EvaluationUtils.extractMateIn(evalAfter);
          if (mateAfter !== null) {
            // ✅ FIXED: Correctly check if player turned the position around
            const isMateAfterForPlayer = (isWhiteMove && mateAfter > 0) || (!isWhiteMove && mateAfter < 0);
            if (isMateAfterForPlayer) {
              return { markerType: MarkerType.BEST, centipawnLoss: 0 };
            }
          }
        }

        // If we're already facing mate from opponent
        if (!isMateForPlayer) {
          // Check if this is a FORCED move (only one legal move)
          let isForcedMove = false;
          if (fenBefore) {
            try {
              const chess = new Chess(fenBefore);
              const legalMoves = chess.moves();
              isForcedMove = legalMoves.length === 1;
            } catch (e) {
              console.error('⚠️ [LOSING SEQUENCE] FEN parsing failed:', e);
            }
          }

          return {
            markerType: isForcedMove ? MarkerType.BEST : MarkerType.GOOD,
            centipawnLoss: 0,
          };
        }
      }
    }

    // ⚠️ CRITICAL FIX: Check if player turned winning/equal position into mate for OPPONENT!
    if (EvaluationUtils.isMateScore(evalAfter)) {
      const mateAfter = EvaluationUtils.extractMateIn(evalAfter);
      if (mateAfter !== null) {
        // ⚠️ CRITICAL FIX: Use the mateAfter sign, NOT evalAfter!
        // mateAfter > 0 means White has mate
        // mateAfter < 0 means Black has mate
        const isMateForPlayer = (isWhiteMove && mateAfter > 0) || (!isWhiteMove && mateAfter < 0);

        if (!isMateForPlayer) {
          // ⚠️ Player is LOSING (mate against them) - this should be a BLUNDER!
          // But ONLY if the player was NOT already in a losing position!
          if (!EvaluationUtils.isMateScore(evalBefore)) {
            return { markerType: MarkerType.BLUNDER, centipawnLoss: 1000 };
          }
        }
      }
    }

    // ✅ CRITICAL: If both evalAfter and evalIfBest are mate scores
    if (EvaluationUtils.isMateScore(evalAfter) && EvaluationUtils.isMateScore(evalIfBestMove)) {
      const mateAfter = EvaluationUtils.extractMateIn(evalAfter);
      const mateBest = EvaluationUtils.extractMateIn(evalIfBestMove);

      if (mateAfter === null || mateBest === null) {
        return { markerType: MarkerType.BEST, centipawnLoss: 0 };
      }

      const mateSideChanged = mateAfter > 0 !== mateBest > 0;
      if (mateSideChanged) {
        return { markerType: MarkerType.BLUNDER, centipawnLoss: 1000 };
      }

      const absAfter = Math.abs(mateAfter);
      const absBest = Math.abs(mateBest);

      if (absAfter === absBest) {
        return { markerType: MarkerType.BEST, centipawnLoss: 0 };
      } else if (absAfter < absBest) {
        return { markerType: MarkerType.BEST, centipawnLoss: 0 };
      } else {
        // ✅ More lenient thresholds for mate sequences
        // Playing a slightly longer mate (up to 2 moves longer) is still GOOD
        // M5 vs M3 = 2 moves longer = GOOD (not punished harshly)
        const movesLonger = absAfter - absBest;
        if (movesLonger <= 2) {
          return { markerType: MarkerType.GOOD, centipawnLoss: 50 };
        } else if (movesLonger <= 4) {
          return { markerType: MarkerType.INACCURACY, centipawnLoss: 150 };
        } else {
          return { markerType: MarkerType.MISTAKE, centipawnLoss: 250 };
        }
      }
    }

    // Both are mate scores (from same starting position)
    if (EvaluationUtils.isMateScore(evalBefore) && EvaluationUtils.isMateScore(evalAfter)) {
      const mateBefore = EvaluationUtils.extractMateIn(evalBefore);
      const mateAfter = EvaluationUtils.extractMateIn(evalAfter);

      if (mateBefore === null || mateAfter === null) {
        return { markerType: MarkerType.GOOD, centipawnLoss: 50 };
      }

      const mateSideChanged = mateBefore > 0 !== mateAfter > 0;

      if (mateSideChanged) {
        // Check if forced move
        let isForcedMove = false;
        if (fenBefore) {
          try {
            const chess = new Chess(fenBefore);
            const legalMoves = chess.moves();
            isForcedMove = legalMoves.length === 1;
          } catch (e) {
            // Continue
          }
        }

        if (isForcedMove) {
          return { markerType: MarkerType.BEST, centipawnLoss: 0 };
        }

        // Might be a sacrifice that leads to mate
        return null; // Let it fall through to brilliant check
      }

      // Same side has mate - check if it improved/maintained
      const absBefore = Math.abs(mateBefore);
      const absAfter = Math.abs(mateAfter);

      if (absAfter <= absBefore) {
        return { markerType: MarkerType.BEST, centipawnLoss: 0 };
      } else {
        // ✅ More lenient thresholds for mate sequences
        // Playing a slightly longer mate (up to 2 moves longer) is still GOOD
        const movesLonger = absAfter - absBefore;
        if (movesLonger <= 2) {
          return { markerType: MarkerType.GOOD, centipawnLoss: 50 };
        } else if (movesLonger <= 4) {
          return { markerType: MarkerType.INACCURACY, centipawnLoss: 150 };
        } else {
          return { markerType: MarkerType.MISTAKE, centipawnLoss: 250 };
        }
      }
    }

    // Mate lost (had mate, lost it)
    if (EvaluationUtils.isMateScore(evalBefore) && !EvaluationUtils.isMateScore(evalAfter)) {
      return null; // Let it fall through to normal calculation
    }

    // Mate found (didn't have mate, found it)
    if (!EvaluationUtils.isMateScore(evalBefore) && EvaluationUtils.isMateScore(evalAfter)) {
      const mateAfter = EvaluationUtils.extractMateIn(evalAfter);
      if (mateAfter !== null) {
        // ✅ FIXED: Consistent check using extractMateIn
        const isMateForPlayer = (isWhiteMove && mateAfter > 0) || (!isWhiteMove && mateAfter < 0);

        // Check if this is a forced move
        let isForcedMove = false;
        if (fenBefore) {
          try {
            const chess = new Chess(fenBefore);
            const legalMoves = chess.moves();
            isForcedMove = legalMoves.length === 1;
          } catch (e) {
            // Continue
          }
        }

        if (isForcedMove) {
          return { markerType: MarkerType.BEST, centipawnLoss: 0 };
        }
      }

      return null; // Let it fall through to normal calculation
    }

    return null;
  }
}

