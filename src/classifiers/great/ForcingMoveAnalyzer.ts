/**
 * Forcing Move Analyzer
 * Detects forcing moves beyond checks: captures, discovered attacks, pins
 * 
 * Forcing moves limit the opponent's options and create tactical threats.
 * These moves require the opponent to respond accurately or suffer consequences.
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { GREAT_MOVE_THRESHOLDS, GreatMoveType, GreatMoveResult } from './GreatMoveThresholds.js';

export class ForcingMoveAnalyzer {
  /**
   * Analyze if a non-check move qualifies as a forcing great move
   * 
   * @param move - The chess move with SAN notation
   * @param centipawnLoss - How much evaluation was lost vs best move
   * @param evalBefore - Position evaluation before the move
   * @param evalAfter - Position evaluation after the move
   * @returns GreatMoveResult indicating if move is great
   */
  analyzeForcingMove(
    move: ExtendedChessMove,
    centipawnLoss: number,
    evalBefore?: number,
    evalAfter?: number
  ): GreatMoveResult {
    // Skip checks - handled by CheckMoveAnalyzer
    if (this._isCheck(move)) {
      return { isGreat: false, centipawnLoss };
    }

    // Check captures first (most common forcing move type)
    if (this._isCapture(move)) {
      return this._analyzeCapture(move, centipawnLoss, evalBefore, evalAfter);
    }

    // Check for other forcing patterns (future enhancement)
    // - Discovered attacks
    // - Pin creation
    // - Fork threats
    
    return { isGreat: false, centipawnLoss };
  }

  /**
   * Analyze capture moves for great move classification
   */
  private _analyzeCapture(
    move: ExtendedChessMove,
    centipawnLoss: number,
    evalBefore?: number,
    evalAfter?: number
  ): GreatMoveResult {
    // Capture must be close to best move
    if (centipawnLoss > GREAT_MOVE_THRESHOLDS.CAPTURE_MAX_CP_LOSS) {
      return { isGreat: false, centipawnLoss };
    }

    // Check if it's a recapture (responding to previous capture)
    // Recaptures can still be great if well-timed
    
    // Capture that improves or maintains position
    if (centipawnLoss <= GREAT_MOVE_THRESHOLDS.MAX_CP_LOSS_FOR_CAPTURES) {
      // Very close to best - definitely great
      if (centipawnLoss <= GREAT_MOVE_THRESHOLDS.MAX_CP_LOSS) {
        return {
          isGreat: true,
          type: GreatMoveType.CAPTURE,
          reason: 'Tactical capture near best move',
          centipawnLoss,
        };
      }

      // Check eval improvement for slightly suboptimal captures
      if (evalBefore !== undefined && evalAfter !== undefined) {
        const evalImprovement = evalAfter - evalBefore;
        
        // ✅ FIXED: Lower threshold from 100cp to 50cp for Great captures
        // Captures that improve position by 0.5+ pawns qualify as Great
        if (evalImprovement >= 50) {
          return {
            isGreat: true,
            type: GreatMoveType.CAPTURE,
            reason: 'Capture winning material',
            centipawnLoss,
          };
        }
      }
    }

    return { isGreat: false, centipawnLoss };
  }

  /**
   * Analyze for discovered attack patterns
   * A discovered attack is when moving a piece reveals an attack from another piece
   */
  analyzeDiscoveredAttack(
    move: ExtendedChessMove,
    centipawnLoss: number,
    createsDiscoveredAttack: boolean
  ): GreatMoveResult {
    if (!GREAT_MOVE_THRESHOLDS.DISCOVERED_ATTACK_BONUS) {
      return { isGreat: false, centipawnLoss };
    }

    if (createsDiscoveredAttack && centipawnLoss <= GREAT_MOVE_THRESHOLDS.FORCING_MOVE_MAX_CP_LOSS) {
      return {
        isGreat: true,
        type: GreatMoveType.DISCOVERED_ATTACK,
        reason: 'Discovered attack creating tactical threats',
        centipawnLoss,
      };
    }

    return { isGreat: false, centipawnLoss };
  }

  /**
   * Analyze for pin creation
   */
  analyzePinCreation(
    move: ExtendedChessMove,
    centipawnLoss: number,
    createsPin: boolean
  ): GreatMoveResult {
    if (!GREAT_MOVE_THRESHOLDS.PIN_CREATION_BONUS) {
      return { isGreat: false, centipawnLoss };
    }

    if (createsPin && centipawnLoss <= GREAT_MOVE_THRESHOLDS.FORCING_MOVE_MAX_CP_LOSS) {
      return {
        isGreat: true,
        type: GreatMoveType.PIN_CREATION,
        reason: 'Creating pin on valuable piece',
        centipawnLoss,
      };
    }

    return { isGreat: false, centipawnLoss };
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

