/**
 * Blunder Detection Thresholds
 * Centralized configuration for identifying blunders
 * 
 * Blunders are critical mistakes that lose significant material or position (2.5+ pawns)
 * They include:
 * - Hanging pieces: Leaving valuable pieces undefended
 * - Mate blindness: Missing checkmate threats
 * - Complete tactics miss: Allowing forced wins
 */

import { MarkerType } from '../../types/index.js';

export const BLUNDER_THRESHOLDS = {
  // ===========================================
  // Basic Classification Thresholds
  // ===========================================
  
  /** Minimum centipawn loss for a blunder */
  MIN_CP_LOSS: 250, // 2.5 pawns
  
  /** No maximum - anything above minimum is a blunder */
  
  // ===========================================
  // Hanging Piece Detection
  // ===========================================
  
  /** Threshold for detecting a hung piece (losing full piece value) */
  HANGING_PIECE_MIN_LOSS: 250,
  
  /** Knight value (common hanging piece) */
  KNIGHT_VALUE: 320,
  
  /** Bishop value */
  BISHOP_VALUE: 330,
  
  /** Rook value */
  ROOK_VALUE: 500,
  
  /** Queen value */
  QUEEN_VALUE: 900,
  
  /** Tolerance for detecting "near piece value" loss */
  PIECE_VALUE_TOLERANCE: 80,
  
  // ===========================================
  // Mate Blindness Detection
  // ===========================================
  
  /** Eval swing that indicates missing mate (from equal to lost) */
  MATE_BLINDNESS_EVAL_SWING: 500,
  
  /** If opponent had mate-in-X and player missed it */
  MISSED_MATE_THREAT: true,
  
  /** Maximum mate moves to consider for blindness */
  MATE_THREAT_MAX_MOVES: 5,
  
  // ===========================================
  // Game-Ending Blunders
  // ===========================================
  
  /** Turning winning position into losing (requires larger swing) */
  GAME_TURNING_SWING: 400,
  
  /** Threshold for "winning" position */
  WINNING_POSITION_THRESHOLD: 200,
  
  /** Threshold for "losing" position after blunder */
  LOSING_POSITION_THRESHOLD: -200,
  
  // ===========================================
  // Context Adjustments
  // ===========================================
  
  /** Apply no forgiveness for blunders - they're always serious */
  OPENING_FORGIVENESS: 1.0,
  MIDDLEGAME_FORGIVENESS: 1.0,
  ENDGAME_FORGIVENESS: 1.0,
  
  // ===========================================
  // Anti-False-Positive Filters
  // ===========================================
  
  /** Don't double-count if position already completely lost */
  ALREADY_LOST_THRESHOLD: -600, // Already 6+ pawns down
  
  /** Don't mark as blunder in checkmate sequences */
  IGNORE_IN_FORCED_MATE: true,
  
  /** Minimum move number for blunder classification */
  MIN_MOVE_NUMBER: 3,
  
  // ===========================================
  // Piece Values for Calculation
  // ===========================================
  
  PIECE_VALUES: {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000,
  },
  
} as const;

/**
 * Types of blunders for classification
 */
export enum BlunderType {
  HANGING_PIECE = 'hanging_piece',
  MATE_BLINDNESS = 'mate_blindness',
  GAME_TURNING = 'game_turning',
  HANGING_QUEEN = 'hanging_queen',
  HANGING_ROOK = 'hanging_rook',
  HANGING_MINOR = 'hanging_minor',
  TACTICAL_DISASTER = 'tactical_disaster',
  GENERAL = 'general',
}

/**
 * Result of blunder detection
 */
export interface BlunderResult {
  isBlunder: boolean;
  type?: BlunderType;
  reason?: string;
  centipawnLoss: number;
  severity?: 'critical' | 'severe' | 'serious';
  pieceHung?: string;
  suggestedMarker?: MarkerType;
}

