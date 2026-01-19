/**
 * Mistake Detection Thresholds
 * Centralized configuration for identifying mistakes
 *
 * Chess.com Definition: "The game is still close to equal, but you lost your advantage"
 *
 * Mistakes can be detected in two ways:
 * 1. Standard: Moves that lose significant evaluation (1.0-2.5 pawns)
 * 2. Advantage Loss: Had advantage, now equal (even with smaller CP loss)
 */

import { MarkerType } from '../../types/index.js';

export const MISTAKE_THRESHOLDS = {
  // ===========================================
  // Basic Classification Thresholds
  // ===========================================

  /** Minimum centipawn loss for a standard mistake */
  MIN_CP_LOSS: 100, // 1.0 pawns (lowered to catch more mistakes)

  /** Maximum centipawn loss before becoming a blunder */
  MAX_CP_LOSS: 250, // 2.5 pawns

  // ===========================================
  // Advantage Loss Detection (Chess.com style)
  // ===========================================

  /** Minimum advantage before move to consider "had advantage" */
  HAD_ADVANTAGE_THRESHOLD: 80, // +0.8 pawns

  /** Maximum eval after move to consider "now equal" */
  NOW_EQUAL_THRESHOLD: 60, // Position between -0.6 and +0.6

  /** Minimum CP loss when advantage is lost (lower threshold) */
  ADVANTAGE_LOSS_MIN_CP: 70, // 0.7 pawns - if you lose advantage, lower bar

  /** Significant advantage that was squandered */
  SIGNIFICANT_ADVANTAGE: 150, // +1.5 pawns

  // ===========================================
  // Positional Mistakes
  // ===========================================

  /** Threshold for piece activity loss */
  PIECE_ACTIVITY_LOSS_THRESHOLD: 100,

  /** Threshold for pawn structure damage */
  PAWN_STRUCTURE_DAMAGE_THRESHOLD: 80,

  /** Threshold for king safety deterioration */
  KING_SAFETY_LOSS_THRESHOLD: 120,

  // ===========================================
  // Tactical Mistakes
  // ===========================================

  /** Losing an undefended piece */
  HANGING_PIECE_THRESHOLD: 200,

  /** Missing a tactical shot (opponent's threat) */
  MISSED_THREAT_THRESHOLD: 150,

  /** Failing to capture free material */
  MISSED_FREE_MATERIAL_THRESHOLD: 150,

  // ===========================================
  // Context Adjustments
  // ===========================================

  /** Opening phase adjustments (moves 1-8) */
  OPENING_FORGIVENESS: 1, // 15% more lenient

  /** Endgame adjustments (move 40+) */
  ENDGAME_FORGIVENESS: 0.9, // 10% more lenient

  /** Middlegame - no forgiveness */
  MIDDLEGAME_FORGIVENESS: 1.0,

  // ===========================================
  // Anti-False-Positive Filters
  // ===========================================

  /** Don't mark as mistake if position was already losing */
  LOSING_POSITION_THRESHOLD: -300, // Already 3+ pawns down

  /** Don't mark as mistake in mate-in-X situations */
  IGNORE_IN_MATE_SEQUENCES: true,

  /** Minimum move number for mistake classification */
  MIN_MOVE_NUMBER: 4,

  // ===========================================
  // STILL WINNING LENIENCY (Chess.com style)
  // ===========================================

  /**
   * If position is STILL winning after the move, be more lenient
   * Chess.com doesn't call it a mistake if you're still clearly winning
   */
  STILL_WINNING_THRESHOLD: 150, // +1.5 pawns = still winning, not a mistake

  /**
   * Enable/disable the "still winning" leniency
   * When enabled, moves that leave you still winning won't be called mistakes
   */
  ENABLE_STILL_WINNING_LENIENCY: true,

  // ===========================================
  // Piece Values for Loss Calculation
  // ===========================================

  PIECE_VALUES: {
    p: 100, // Pawn
    n: 320, // Knight
    b: 330, // Bishop
    r: 500, // Rook
    q: 900, // Queen
    k: 20000, // King (not relevant for mistakes)
  },
} as const;

/**
 * Types of mistakes for classification
 */
export enum MistakeType {
  POSITIONAL = 'positional',
  TACTICAL = 'tactical',
  HANGING_PIECE = 'hanging_piece',
  MISSED_THREAT = 'missed_threat',
  PIECE_ACTIVITY = 'piece_activity',
  PAWN_STRUCTURE = 'pawn_structure',
  KING_SAFETY = 'king_safety',
  GENERAL = 'general',
  /** Chess.com style: "Game still equal but lost your advantage" */
  LOST_ADVANTAGE = 'lost_advantage',
}

/**
 * Result of mistake detection
 */
export interface MistakeResult {
  isMistake: boolean;
  type?: MistakeType;
  reason?: string;
  centipawnLoss: number;
  severity?: 'light' | 'moderate' | 'serious';
  suggestedMarker?: MarkerType;
}
