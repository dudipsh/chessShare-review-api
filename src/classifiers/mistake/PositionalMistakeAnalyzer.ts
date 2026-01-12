/**
 * Positional Mistake Analyzer
 * Detects mistakes related to piece placement, pawn structure, and king safety
 * 
 * Positional mistakes are subtle errors that don't immediately lose material
 * but weaken the overall position over time.
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { MISTAKE_THRESHOLDS, MistakeType, MistakeResult } from './MistakeThresholds.js';
import { MarkerType } from '../../types/index.js';

export class PositionalMistakeAnalyzer {
  /**
   * Analyze if a move is a positional mistake
   * 
   * @param move - The chess move
   * @param centipawnLoss - How much evaluation was lost
   * @param evalBefore - Position evaluation before move
   * @param evalAfter - Position evaluation after move
   * @returns MistakeResult indicating if move is a mistake
   */
  analyzePositional(
    move: ExtendedChessMove,
    centipawnLoss: number,
    evalBefore?: number,
    evalAfter?: number
  ): MistakeResult {
    // Check if loss is in mistake range
    if (centipawnLoss < MISTAKE_THRESHOLDS.MIN_CP_LOSS || 
        centipawnLoss >= MISTAKE_THRESHOLDS.MAX_CP_LOSS) {
      return { isMistake: false, centipawnLoss };
    }

    // Skip if no evaluation data
    if (evalBefore === undefined || evalAfter === undefined) {
      return this._classifyGenericMistake(centipawnLoss);
    }

    // Analyze the type of positional weakness created
    
    // Check for king safety deterioration (moving king to worse square)
    if (this._affectsKingSafety(move)) {
      if (centipawnLoss >= MISTAKE_THRESHOLDS.KING_SAFETY_LOSS_THRESHOLD) {
        return {
          isMistake: true,
          type: MistakeType.KING_SAFETY,
          reason: 'Move weakens king safety',
          centipawnLoss,
          severity: this._getSeverity(centipawnLoss),
          suggestedMarker: MarkerType.MISTAKE,
        };
      }
    }

    // Check for pawn structure damage
    if (this._affectsPawnStructure(move)) {
      if (centipawnLoss >= MISTAKE_THRESHOLDS.PAWN_STRUCTURE_DAMAGE_THRESHOLD) {
        return {
          isMistake: true,
          type: MistakeType.PAWN_STRUCTURE,
          reason: 'Move damages pawn structure',
          centipawnLoss,
          severity: this._getSeverity(centipawnLoss),
          suggestedMarker: MarkerType.MISTAKE,
        };
      }
    }

    // Check for piece activity loss
    if (this._reducePieceActivity(move)) {
      if (centipawnLoss >= MISTAKE_THRESHOLDS.PIECE_ACTIVITY_LOSS_THRESHOLD) {
        return {
          isMistake: true,
          type: MistakeType.PIECE_ACTIVITY,
          reason: 'Move reduces piece activity',
          centipawnLoss,
          severity: this._getSeverity(centipawnLoss),
          suggestedMarker: MarkerType.MISTAKE,
        };
      }
    }

    // Generic positional mistake if in range
    return this._classifyGenericMistake(centipawnLoss);
  }

  /**
   * Classify as generic positional mistake
   */
  private _classifyGenericMistake(centipawnLoss: number): MistakeResult {
    if (centipawnLoss >= MISTAKE_THRESHOLDS.MIN_CP_LOSS &&
        centipawnLoss < MISTAKE_THRESHOLDS.MAX_CP_LOSS) {
      return {
        isMistake: true,
        type: MistakeType.POSITIONAL,
        reason: 'Positional mistake losing evaluation',
        centipawnLoss,
        severity: this._getSeverity(centipawnLoss),
        suggestedMarker: MarkerType.MISTAKE,
      };
    }
    return { isMistake: false, centipawnLoss };
  }

  /**
   * Check if move affects king safety (king or castling involved)
   */
  private _affectsKingSafety(move: ExtendedChessMove): boolean {
    const piece = move.piece?.toLowerCase() || '';
    
    // King moves (except castling in some cases)
    if (piece === 'k') return true;
    
    // Pawn moves in front of king
    // This is a heuristic - would need board state for accurate detection
    if (piece === 'p') {
      const file = move.to?.[0];
      // f, g, h pawns often protect castled king
      if (file === 'f' || file === 'g' || file === 'h') return true;
    }
    
    return false;
  }

  /**
   * Check if move affects pawn structure
   */
  private _affectsPawnStructure(move: ExtendedChessMove): boolean {
    const piece = move.piece?.toLowerCase() || '';
    
    // Pawn moves always affect structure
    if (piece === 'p') return true;
    
    // Pawn captures create structural changes
    if (move.san?.includes('x') && move.captured === 'p') return true;
    
    return false;
  }

  /**
   * Check if move reduces piece activity (piece retreats)
   */
  private _reducePieceActivity(move: ExtendedChessMove): boolean {
    const piece = move.piece?.toLowerCase() || '';
    
    // Skip pawns and kings
    if (piece === 'p' || piece === 'k') return false;
    
    // Heuristic: moves to back ranks often reduce activity
    const toRank = move.to?.[1];
    if (toRank === '1' || toRank === '8') return true;
    
    return false;
  }

  /**
   * Get severity based on centipawn loss
   */
  private _getSeverity(cpLoss: number): 'light' | 'moderate' | 'serious' {
    if (cpLoss >= 220) return 'serious';
    if (cpLoss >= 180) return 'moderate';
    return 'light';
  }
}

