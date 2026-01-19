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

    // ⚠️ CRITICAL SAFETY CHECK: If player STILL has winning mate after move, NEVER mark as BLUNDER!
    // M3 → M9 is at worst an INACCURACY, never a BLUNDER
    if (EvaluationUtils.isMateScore(evalAfter)) {
      const mateAfter = EvaluationUtils.extractMateIn(evalAfter);
      if (mateAfter !== null) {
        // Check if this is a winning mate FOR THE PLAYER (not against them)
        const isMateForPlayer = (isWhiteMove && mateAfter > 0) || (!isWhiteMove && mateAfter < 0);

        if (isMateForPlayer) {
          // Player still has winning mate - at WORST this is INACCURACY
          // Compare with evalBefore to determine severity
          if (EvaluationUtils.isMateScore(evalBefore)) {
            const mateBefore = EvaluationUtils.extractMateIn(evalBefore);
            if (mateBefore !== null) {
              const wasAlsoMateForPlayer = (isWhiteMove && mateBefore > 0) || (!isWhiteMove && mateBefore < 0);
              if (wasAlsoMateForPlayer) {
                // Had mate, still have mate - check how much longer
                const absBefore = Math.abs(mateBefore);
                const absAfter = Math.abs(mateAfter);
                const movesLonger = absAfter - absBefore;

                if (absAfter <= absBefore) {
                  // Mate is same or faster - BEST
                  return { markerType: MarkerType.BEST, centipawnLoss: 0 };
                }

                if (movesLonger <= 3) {
                  return { markerType: MarkerType.GOOD, centipawnLoss: 30 };
                } else {
                  // Even 10+ moves longer is just INACCURACY - still have mate!
                  return { markerType: MarkerType.INACCURACY, centipawnLoss: 80 };
                }
              }
            }
          }
          // Found mate from non-mate position - let it fall through for brilliant check
          // But ensure it's at least GOOD if not caught elsewhere
        }
      }
    }

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
        // ✅ VERY lenient thresholds for mate sequences
        // If you STILL have mate, it's NEVER a blunder or mistake!
        // At worst it's an inaccuracy - you're still winning
        const movesLonger = absAfter - absBest;
        if (movesLonger <= 3) {
          return { markerType: MarkerType.GOOD, centipawnLoss: 30 };
        } else {
          // Even 10+ moves longer is just INACCURACY - you still have mate!
          return { markerType: MarkerType.INACCURACY, centipawnLoss: 80 };
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
        // ✅ VERY lenient thresholds for mate sequences
        // If you STILL have mate, it's NEVER a blunder or mistake!
        // At worst it's an inaccuracy - you're still winning
        const movesLonger = absAfter - absBefore;
        if (movesLonger <= 3) {
          return { markerType: MarkerType.GOOD, centipawnLoss: 30 };
        } else {
          // Even 10+ moves longer is just INACCURACY - you still have mate!
          return { markerType: MarkerType.INACCURACY, centipawnLoss: 80 };
        }
      }
    }

    // Mate lost (had mate, lost it)
    if (EvaluationUtils.isMateScore(evalBefore) && !EvaluationUtils.isMateScore(evalAfter)) {
      const mateBefore = EvaluationUtils.extractMateIn(evalBefore);
      // Check if player had the mate (not opponent)
      const playerHadMate = mateBefore !== null &&
        ((isWhiteMove && mateBefore > 0) || (!isWhiteMove && mateBefore < 0));

      if (playerHadMate) {
        // Player lost their forced mate - but check if still winning big
        const playerEvalAfter = isWhiteMove ? evalAfter : -evalAfter;

        if (playerEvalAfter >= 500) {
          // Still winning by 5+ pawns - this is INACCURACY at worst, not BLUNDER
          return { markerType: MarkerType.INACCURACY, centipawnLoss: 100 };
        } else if (playerEvalAfter >= 200) {
          // Still winning by 2+ pawns - MISTAKE
          return { markerType: MarkerType.MISTAKE, centipawnLoss: 150 };
        }
        // Less than +2 pawns after losing mate - that's a real blunder, fall through
      }
      return null; // Let it fall through to normal calculation
    }

    // Mate found (didn't have mate, found it)
    if (!EvaluationUtils.isMateScore(evalBefore) && EvaluationUtils.isMateScore(evalAfter)) {
      const mateAfter = EvaluationUtils.extractMateIn(evalAfter);
      if (mateAfter !== null) {
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

