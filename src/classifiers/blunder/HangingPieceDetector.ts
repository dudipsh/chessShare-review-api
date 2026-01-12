/**
 * Hanging Piece Detector
 * Detects blunders caused by leaving pieces undefended
 * 
 * A hanging piece is an undefended piece that can be captured for free
 * or a piece that's insufficiently defended.
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { MarkerType } from '../../types/index.js';
import { BLUNDER_THRESHOLDS, BlunderType, BlunderResult } from './BlunderThresholds.js';

export class HangingPieceDetector {
  /**
   * Analyze if move results in a hanging piece
   * 
   * @param move - The chess move
   * @param centipawnLoss - How much evaluation was lost
   * @param evalBefore - Position evaluation before move
   * @param evalAfter - Position evaluation after move
   * @returns BlunderResult indicating if move hangs a piece
   */
  analyzeHangingPiece(
    move: ExtendedChessMove,
    centipawnLoss: number,
    evalBefore?: number,
    evalAfter?: number
  ): BlunderResult {
    // Must be at least blunder threshold
    if (centipawnLoss < BLUNDER_THRESHOLDS.MIN_CP_LOSS) {
      return { isBlunder: false, centipawnLoss };
    }

    // Detect which piece might be hanging based on loss value
    const pieceInfo = this._detectHungPiece(centipawnLoss);
    
    if (pieceInfo) {
      return {
        isBlunder: true,
        type: pieceInfo.type,
        reason: `Move hangs ${pieceInfo.pieceName}`,
        centipawnLoss,
        severity: pieceInfo.severity,
        pieceHung: pieceInfo.pieceName,
        suggestedMarker: MarkerType.BLUNDER,
      };
    }

    // General hanging piece if loss is high but doesn't match piece value
    if (centipawnLoss >= BLUNDER_THRESHOLDS.HANGING_PIECE_MIN_LOSS) {
      return {
        isBlunder: true,
        type: BlunderType.HANGING_PIECE,
        reason: 'Move leaves material hanging',
        centipawnLoss,
        severity: this._getSeverity(centipawnLoss),
        suggestedMarker: MarkerType.BLUNDER,
      };
    }

    return { isBlunder: false, centipawnLoss };
  }

  /**
   * Detect which piece might be hung based on centipawn loss
   */
  private _detectHungPiece(cpLoss: number): {
    type: BlunderType;
    pieceName: string;
    severity: 'critical' | 'severe' | 'serious';
  } | null {
    const tolerance = BLUNDER_THRESHOLDS.PIECE_VALUE_TOLERANCE;

    // Check for hanging queen (most severe)
    if (this._isNearValue(cpLoss, BLUNDER_THRESHOLDS.QUEEN_VALUE, tolerance)) {
      return {
        type: BlunderType.HANGING_QUEEN,
        pieceName: 'Queen',
        severity: 'critical',
      };
    }

    // Check for hanging rook
    if (this._isNearValue(cpLoss, BLUNDER_THRESHOLDS.ROOK_VALUE, tolerance)) {
      return {
        type: BlunderType.HANGING_ROOK,
        pieceName: 'Rook',
        severity: 'severe',
      };
    }

    // Check for hanging minor piece (knight/bishop)
    if (this._isNearValue(cpLoss, BLUNDER_THRESHOLDS.KNIGHT_VALUE, tolerance) ||
        this._isNearValue(cpLoss, BLUNDER_THRESHOLDS.BISHOP_VALUE, tolerance)) {
      return {
        type: BlunderType.HANGING_MINOR,
        pieceName: 'Minor piece',
        severity: 'serious',
      };
    }

    // Check for hanging queen + exchange (Q for R + minor)
    // ~900 - 500 = ~400 exchange value, but full Q loss = 900
    if (cpLoss >= 700 && cpLoss <= 950) {
      return {
        type: BlunderType.HANGING_QUEEN,
        pieceName: 'Queen or major material',
        severity: 'critical',
      };
    }

    // Check for hanging rook + exchange
    if (cpLoss >= 400 && cpLoss < 700) {
      return {
        type: BlunderType.HANGING_ROOK,
        pieceName: 'Rook or significant material',
        severity: 'severe',
      };
    }

    return null;
  }

  /**
   * Check if a value is near a target value within tolerance
   */
  private _isNearValue(value: number, target: number, tolerance: number): boolean {
    return Math.abs(value - target) <= tolerance;
  }

  /**
   * Get severity based on centipawn loss
   */
  private _getSeverity(cpLoss: number): 'critical' | 'severe' | 'serious' {
    if (cpLoss >= 700) return 'critical';
    if (cpLoss >= 400) return 'severe';
    return 'serious';
  }
}

