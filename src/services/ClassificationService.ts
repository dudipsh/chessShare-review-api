/**
 * Classification Service - Orchestrates move classification
 * Adapted from MoveClassificationService for server-side use
 */

import type {
  ExtendedChessMove,
  StockfishAnalysis,
} from '../types/index.js';
import { MarkerType } from '../types/index.js';
import { classificationLog, logMoveClassification, clearClassificationLog } from '../utils/classificationLogger.js';
import {
  MOVE_CLASSIFICATION_THRESHOLDS,
  getMarkerTypeByLoss,
  getGamePhaseForgiveness,
} from '../config/constants.js';

// Import all classifiers
import {
  EvaluationUtils,
  CentipawnLossCalculator,
  MateSequenceHandler,
  TopMovesClassifier,
  GreatMoveClassifier,
  EarlyReturnChecker,
  ContextExtractor,
  MateSafetyChecker,
  type MoveContext,
} from '../classifiers/index.js';

// Import modular classifiers
import { BrilliantDetector } from '../classifiers/brilliant/index.js';
import { GreatMoveDetector } from '../classifiers/great/index.js';
import { MistakeDetector } from '../classifiers/mistake/index.js';
import { BlunderDetector } from '../classifiers/blunder/index.js';
import { MissDetector } from '../classifiers/miss/index.js';
import { InaccuracyDetector } from '../classifiers/inaccuracy/index.js';

export interface ClassificationResult {
  markerType: MarkerType;
  centipawnLoss: number;
}

export class ClassificationService {
  private currentMoveNumber: number | undefined;
  private currentGameWinner: 'white' | 'black' | 'draw' | null = null;

  // Classifier instances
  private readonly centipawnCalc = new CentipawnLossCalculator();
  private readonly mateHandler = new MateSequenceHandler();
  private readonly topMovesClassifier = new TopMovesClassifier();
  private readonly brilliantDetector = new BrilliantDetector();
  private readonly greatClassifier = new GreatMoveClassifier();
  private readonly earlyReturnChecker = new EarlyReturnChecker();
  private readonly contextExtractor = new ContextExtractor();
  private readonly mateSafetyChecker = new MateSafetyChecker();

  // Modular classifiers
  private readonly greatMoveDetector = new GreatMoveDetector();
  private readonly mistakeDetector = new MistakeDetector();
  private readonly blunderDetector = new BlunderDetector();
  private readonly missDetector = new MissDetector();
  private readonly inaccuracyDetector = new InaccuracyDetector();

  /**
   * Reset service state for new game
   */
  reset(): void {
    this.currentMoveNumber = undefined;
    this.currentGameWinner = null;
    clearClassificationLog();
    classificationLog('=== NEW GAME ANALYSIS STARTED ===');
  }

  /**
   * Classify a move
   */
  classifyMove(
    fenBefore: string,
    playedMove: ExtendedChessMove,
    analysisBefore: StockfishAnalysis,
    analysisAfter: StockfishAnalysis,
    moveNumber?: number,
    gameWinner?: 'white' | 'black' | 'draw' | null
  ): ClassificationResult {
    // Store context
    this.currentMoveNumber = moveNumber;
    this.currentGameWinner = gameWinner || null;

    // 1. Quick checks (NAGs, checkmate)
    const earlyReturn = this.earlyReturnChecker.check(playedMove);
    if (earlyReturn) {
      return earlyReturn;
    }

    // 2. Extract context
    const context = this.contextExtractor.extract(
      fenBefore,
      playedMove,
      analysisBefore,
      analysisAfter,
      moveNumber
    );

    // 3. Calculate centipawn loss
    const rawCentipawnLoss = this.centipawnCalc.calculate({
      evalBefore: context.evalBefore,
      evalAfter: context.evalAfter,
      evalIfBestMove: context.evalIfBestMove,
      isWhiteMove: context.isWhiteMove,
      isEvalIfBestUnreliable: context.isEvalIfBestUnreliable,
      isInTopMoves: context.isInTopMoves,
      fenAfter: context.fenAfter,
      moveNumber: context.moveNumber,
      gameWinner: gameWinner,
      playedMove: playedMove,
    });

    // Apply forgiveness
    const forgiveness = moveNumber ? getGamePhaseForgiveness(moveNumber) : 1.0;
    const centipawnLoss = Math.round(rawCentipawnLoss * forgiveness);

    // 4. Handle mate sequences
    const mateResult = this.handleMateWithSacrificeCheck(
      context,
      playedMove,
      centipawnLoss
    );
    if (mateResult) {
      return mateResult;
    }

    // 5. Check brilliant
    const brilliantResult = this.brilliantDetector.isBrilliant({
      move: playedMove,
      fenBefore: context.fenBefore,
      fenAfter: context.fenAfter,
      evalBefore: context.evalBefore,
      evalAfter: context.evalAfter,
      isWhiteMove: context.isWhiteMove,
      centipawnLoss,
      topMoves: analysisBefore.topMoves || [],
      playedMoveUci: context.playedMoveUci,
      moveNumber: context.moveNumber,
      topMovesAfter: analysisAfter.topMoves,
    });

    classificationLog(`Move ${moveNumber}: ${playedMove.san} | eval: ${context.evalBefore} → ${context.evalAfter} | cpLoss=${centipawnLoss} | Brilliant? ${brilliantResult.isBrilliant} (${brilliantResult.reason || 'N/A'})`);

    if (brilliantResult.isBrilliant) {
      logMoveClassification({
        moveNumber,
        move: playedMove.san,
        evalBefore: context.evalBefore,
        evalAfter: context.evalAfter,
        centipawnLoss,
        markerType: 'BRILLIANT',
        isBrilliantCheck: true,
        brilliantReason: brilliantResult.reason,
      });
      return { markerType: MarkerType.BRILLIANT, centipawnLoss };
    }

    // 6. Check if played move IS the best move
    if (centipawnLoss === 0) {
      return this.classifyBestMove(context, centipawnLoss, gameWinner);
    }

    // 7. Check if in top moves
    const topMoveResult = this.classifyTopMove(
      context.playedMoveUci,
      analysisBefore,
      centipawnLoss
    );
    if (topMoveResult) {
      return topMoveResult;
    }

    // 8. Check great moves
    const greatResult = this.greatMoveDetector.isGreat({
      move: playedMove,
      centipawnLoss,
      evalBefore: context.evalBefore,
      evalAfter: context.evalAfter,
      moveNumber: context.moveNumber,
    });
    if (greatResult.isGreat) {
      return { markerType: MarkerType.GREAT, centipawnLoss };
    }

    // 9. Safety check: mate for player
    const mateSafety = this.mateSafetyChecker.checkMateSafety(
      context.evalAfter,
      context.isWhiteMove,
      centipawnLoss
    );
    if (mateSafety) {
      return mateSafety;
    }

    // 10. Final classification using modular detectors
    const finalMarkerType = this.classifyUsingModularDetectors(
      playedMove,
      centipawnLoss,
      context.evalBefore,
      context.evalAfter,
      context.moveNumber,
      context.isWhiteMove
    );

    logMoveClassification({
      moveNumber,
      move: playedMove.san,
      evalBefore: context.evalBefore,
      evalAfter: context.evalAfter,
      centipawnLoss,
      markerType: finalMarkerType,
    });

    return { markerType: finalMarkerType, centipawnLoss };
  }

  /**
   * Classify move using modular detectors
   */
  private classifyUsingModularDetectors(
    move: ExtendedChessMove,
    centipawnLoss: number,
    evalBefore?: number,
    evalAfter?: number,
    moveNumber?: number,
    isWhiteMove?: boolean
  ): MarkerType {
    // Check for blunder first (most severe)
    const blunderResult = this.blunderDetector.isBlunder({
      move,
      centipawnLoss,
      evalBefore,
      evalAfter,
      moveNumber,
      isWhiteMove,
    });
    if (blunderResult.isBlunder) {
      return MarkerType.BLUNDER;
    }

    // Check for mistake
    const mistakeResult = this.mistakeDetector.isMistake({
      move,
      centipawnLoss,
      evalBefore,
      evalAfter,
      moveNumber,
      isWhiteMove,
    });
    if (mistakeResult.isMistake) {
      return MarkerType.MISTAKE;
    }

    // Check for miss
    const missResult = this.missDetector.isMiss({
      move,
      centipawnLoss,
      evalBefore,
      evalAfter,
      moveNumber,
    });
    if (missResult.isMiss) {
      return MarkerType.MISS;
    }

    // Check for inaccuracy
    const inaccuracyResult = this.inaccuracyDetector.isInaccuracy({
      move,
      centipawnLoss,
      evalBefore,
      evalAfter,
      moveNumber,
    });
    if (inaccuracyResult.isInaccuracy) {
      return MarkerType.INACCURACY;
    }

    // Fallback to threshold-based classification
    return getMarkerTypeByLoss(centipawnLoss);
  }

  private handleMateWithSacrificeCheck(
    context: MoveContext,
    playedMove: ExtendedChessMove,
    centipawnLoss: number
  ): ClassificationResult | null {
    const mateResult = this.mateHandler.handleMateSequence({
      evalBefore: context.evalBefore,
      evalAfter: context.evalAfter,
      evalIfBestMove: context.evalIfBestMove,
      isWhiteMove: context.isWhiteMove,
      fenBefore: context.fenBefore,
      playedMove: playedMove,
    });

    return mateResult;
  }

  private classifyBestMove(
    context: MoveContext,
    centipawnLoss: number,
    gameWinner?: 'white' | 'black' | 'draw' | null
  ): ClassificationResult {
    const evalDifference = Math.abs(context.evalAfter - context.evalIfBestMove);

    if (evalDifference > 500) {
      const markerType = getMarkerTypeByLoss(centipawnLoss);
      return { markerType, centipawnLoss };
    }

    let adjustedCpLoss = centipawnLoss;

    if (adjustedCpLoss > MOVE_CLASSIFICATION_THRESHOLDS.BEST) {
      const markerType = getMarkerTypeByLoss(adjustedCpLoss);
      return { markerType, centipawnLoss: adjustedCpLoss };
    }

    return { markerType: MarkerType.BEST, centipawnLoss: adjustedCpLoss };
  }

  private classifyTopMove(
    playedMoveUci: string,
    analysisBefore: StockfishAnalysis,
    adjustedCpLoss: number
  ): ClassificationResult | null {
    if (!analysisBefore.topMoves?.length) return null;

    const topMoves = analysisBefore.topMoves;
    const playedMoveIndex = topMoves.findIndex(
      (m) => m.uci.toLowerCase() === playedMoveUci.toLowerCase()
    );

    if (playedMoveIndex === -1) return null;

    return this.topMovesClassifier.classifyTopMove(
      playedMoveIndex,
      adjustedCpLoss,
      topMoves
    );
  }
}

// Singleton instance
export const classificationService = new ClassificationService();
