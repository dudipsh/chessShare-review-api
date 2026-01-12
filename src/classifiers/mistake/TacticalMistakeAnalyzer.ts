/**
 * Tactical Mistake Analyzer
 * Detects mistakes related to tactics: hanging pieces, missed threats
 * 
 * Tactical mistakes are more concrete - they often involve material loss
 * or missing a winning tactical sequence.
 */

import type { ExtendedChessMove } from '../../types/index.js';
import { MISTAKE_THRESHOLDS, MistakeType, MistakeResult } from './MistakeThresholds.js';
import { MarkerType } from '../../types/index.js';

export class TacticalMistakeAnalyzer {
  /**
   * Analyze if a move is a tactical mistake
   * 
   * @param move - The chess move
   * @param centipawnLoss - How much evaluation was lost
   * @param bestMove - The best move in the position (if known)
   * @param wasCapturingBestMove - Whether best move was a capture
   * @returns MistakeResult indicating if move is a mistake
   */
  analyzeTactical(
    move: ExtendedChessMove,
    centipawnLoss: number,
    bestMove?: string,
    wasCapturingBestMove?: boolean
  ): MistakeResult {
    // Check if loss is in mistake range
    if (centipawnLoss < MISTAKE_THRESHOLDS.MIN_CP_LOSS || 
        centipawnLoss >= MISTAKE_THRESHOLDS.MAX_CP_LOSS) {
      return { isMistake: false, centipawnLoss };
    }

    // Check for hanging piece
    const hangingResult = this._analyzeHangingPiece(move, centipawnLoss);
    if (hangingResult.isMistake) return hangingResult;

    // Check for missed threat
    const missedThreatResult = this._analyzeMissedThreat(
      move, 
      centipawnLoss, 
      bestMove, 
      wasCapturingBestMove
    );
    if (missedThreatResult.isMistake) return missedThreatResult;

    // Generic tactical mistake
    return this._classifyGenericTactical(centipawnLoss);
  }

  /**
   * Analyze if move leaves a piece hanging
   */
  private _analyzeHangingPiece(
    move: ExtendedChessMove,
    centipawnLoss: number
  ): MistakeResult {
    // If loss matches piece value ranges, likely hanging piece
    const piece = move.piece?.toLowerCase() || '';
    const pieceValues = MISTAKE_THRESHOLDS.PIECE_VALUES;
    
    // Check if loss roughly matches a piece value
    // This is a heuristic - real detection would need board analysis
    for (const [pieceType, value] of Object.entries(pieceValues)) {
      if (pieceType === 'k') continue; // Skip king
      
      // If loss is close to piece value, likely that piece is hanging
      const lossRange = 50; // Allow 50cp variance
      if (centipawnLoss >= value - lossRange && centipawnLoss <= value + lossRange) {
        // Need more context to confirm, but suspicious
        if (centipawnLoss >= MISTAKE_THRESHOLDS.HANGING_PIECE_THRESHOLD) {
          return {
            isMistake: true,
            type: MistakeType.HANGING_PIECE,
            reason: `Move may leave ${pieceType.toUpperCase()} hanging`,
            centipawnLoss,
            severity: this._getSeverity(centipawnLoss),
            suggestedMarker: MarkerType.MISTAKE,
          };
        }
      }
    }

    return { isMistake: false, centipawnLoss };
  }

  /**
   * Analyze if move misses a tactical threat
   */
  private _analyzeMissedThreat(
    move: ExtendedChessMove,
    centipawnLoss: number,
    bestMove?: string,
    wasCapturingBestMove?: boolean
  ): MistakeResult {
    // If best move was a capture and player didn't capture, might be missed threat
    if (wasCapturingBestMove && !this._isCapture(move)) {
      if (centipawnLoss >= MISTAKE_THRESHOLDS.MISSED_FREE_MATERIAL_THRESHOLD) {
        return {
          isMistake: true,
          type: MistakeType.MISSED_THREAT,
          reason: 'Missed winning capture',
          centipawnLoss,
          severity: this._getSeverity(centipawnLoss),
          suggestedMarker: MarkerType.MISTAKE,
        };
      }
    }

    // If best move looks tactical (capture, check) and player didn't play it
    if (bestMove && this._looksTactical(bestMove) && !this._looksTactical(move.san || '')) {
      if (centipawnLoss >= MISTAKE_THRESHOLDS.MISSED_THREAT_THRESHOLD) {
        return {
          isMistake: true,
          type: MistakeType.MISSED_THREAT,
          reason: 'Missed tactical opportunity',
          centipawnLoss,
          severity: this._getSeverity(centipawnLoss),
          suggestedMarker: MarkerType.MISTAKE,
        };
      }
    }

    return { isMistake: false, centipawnLoss };
  }

  /**
   * Classify as generic tactical mistake
   */
  private _classifyGenericTactical(centipawnLoss: number): MistakeResult {
    if (centipawnLoss >= MISTAKE_THRESHOLDS.MIN_CP_LOSS &&
        centipawnLoss < MISTAKE_THRESHOLDS.MAX_CP_LOSS) {
      return {
        isMistake: true,
        type: MistakeType.TACTICAL,
        reason: 'Tactical mistake',
        centipawnLoss,
        severity: this._getSeverity(centipawnLoss),
        suggestedMarker: MarkerType.MISTAKE,
      };
    }
    return { isMistake: false, centipawnLoss };
  }

  /**
   * Check if move is a capture
   */
  private _isCapture(move: ExtendedChessMove): boolean {
    return move.san?.includes('x') || !!move.captured;
  }

  /**
   * Check if move looks tactical (capture, check, or promotion)
   */
  private _looksTactical(san: string): boolean {
    return san.includes('x') || san.includes('+') || san.includes('=');
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

