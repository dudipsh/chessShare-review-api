/**
 * Great Move Detector
 * Main orchestrator for detecting "Great" moves (Chess.com style)
 * 
 * Great moves are forcing tactical moves that are near-optimal:
 * - Checks that create significant pressure
 * - Captures that win material or create tactical threats
 * - Forcing moves that limit opponent options
 * 
 * This replaces the simpler GreatMoveClassifier with a modular architecture
 * matching the BrilliantDetector pattern.
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { CheckMoveAnalyzer } from './CheckMoveAnalyzer.js';
import { ForcingMoveAnalyzer } from './ForcingMoveAnalyzer.js';
import { 
  GREAT_MOVE_THRESHOLDS, 
  GreatMoveType, 
  GreatMoveResult 
} from './GreatMoveThresholds.js';

/**
 * Context for great move detection
 */
export interface GreatMoveContext {
  /** The move to analyze */
  move: ExtendedChessMove;
  /** Centipawn loss vs best move */
  centipawnLoss: number;
  /** Position evaluation before move (in centipawns) */
  evalBefore?: number;
  /** Position evaluation after move (in centipawns) */
  evalAfter?: number;
  /** Current move number */
  moveNumber?: number;
  /** Mate-in count if applicable */
  mateIn?: number;
  /** Whether move creates discovered attack (if known) */
  createsDiscoveredAttack?: boolean;
  /** Whether move creates pin (if known) */
  createsPin?: boolean;
}

export class GreatMoveDetector {
  private _checkAnalyzer = new CheckMoveAnalyzer();
  private _forcingAnalyzer = new ForcingMoveAnalyzer();

  /**
   * Main entry point - detect if a move is "Great"
   * 
   * @param ctx - Context with move and evaluation data
   * @returns GreatMoveResult with classification details
   */
  isGreat(ctx: GreatMoveContext): GreatMoveResult {
    const { 
      move, 
      centipawnLoss, 
      evalBefore, 
      evalAfter, 
      moveNumber,
      mateIn,
      createsDiscoveredAttack,
      createsPin,
    } = ctx;

    // Early rejection: Move too far from best
    if (centipawnLoss > GREAT_MOVE_THRESHOLDS.MAX_CP_LOSS_FOR_CAPTURES) {
      return { isGreat: false, centipawnLoss };
    }

    // Early rejection: Too early in game (likely book moves)
    if (moveNumber !== undefined && moveNumber < GREAT_MOVE_THRESHOLDS.MIN_MOVE_NUMBER) {
      return { isGreat: false, centipawnLoss };
    }

    // Check moves (highest priority for great classification)
    if (this._isCheck(move)) {
      // Filter out trivial mate checks
      if (this._checkAnalyzer.isTrivialMateCheck(move, evalAfter, mateIn)) {
        return { isGreat: false, centipawnLoss };
      }
      
      const checkResult = this._checkAnalyzer.analyzeCheck(
        move, 
        centipawnLoss, 
        evalBefore, 
        evalAfter
      );
      if (checkResult.isGreat) return checkResult;
    }

    // Captures (second priority)
    if (this._isCapture(move)) {
      const captureResult = this._forcingAnalyzer.analyzeForcingMove(
        move,
        centipawnLoss,
        evalBefore,
        evalAfter
      );
      if (captureResult.isGreat) return captureResult;
    }

    // Discovered attacks (if detection is provided)
    if (createsDiscoveredAttack) {
      const discoveredResult = this._forcingAnalyzer.analyzeDiscoveredAttack(
        move,
        centipawnLoss,
        createsDiscoveredAttack
      );
      if (discoveredResult.isGreat) return discoveredResult;
    }

    // Pin creation (if detection is provided)
    if (createsPin) {
      const pinResult = this._forcingAnalyzer.analyzePinCreation(
        move,
        centipawnLoss,
        createsPin
      );
      if (pinResult.isGreat) return pinResult;
    }

    // Not a great move
    return { isGreat: false, centipawnLoss };
  }

  /**
   * Legacy compatibility method matching old GreatMoveClassifier interface
   * 
   * @param move - The chess move
   * @param centipawnLoss - Centipawn loss
   * @returns boolean indicating if move is great
   */
  isGreatMove(move: ExtendedChessMove, centipawnLoss: number): boolean {
    const result = this.isGreat({ move, centipawnLoss });
    return result.isGreat;
  }

  /**
   * Get detailed great move analysis
   * 
   * @param ctx - Full context for analysis
   * @returns Detailed result with type and reason
   */
  getGreatMoveDetails(ctx: GreatMoveContext): GreatMoveResult {
    return this.isGreat(ctx);
  }

  /**
   * Check if move is a check
   */
  private _isCheck(move: ExtendedChessMove): boolean {
    return move.san?.includes('+') || false;
  }

  /**
   * Check if move is a capture
   */
  private _isCapture(move: ExtendedChessMove): boolean {
    return move.san?.includes('x') || !!move.captured;
  }
}

// Export singleton for easy usage
export const greatMoveDetector = new GreatMoveDetector();

