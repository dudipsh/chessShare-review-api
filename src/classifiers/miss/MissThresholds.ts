/**
 * Miss Detection Thresholds
 * Centralized configuration for identifying "Miss" moves
 * 
 * A "Miss" is a move that misses a tactical opportunity.
 * It's lighter than a mistake - the player made a reasonable move
 * but failed to find a better tactical shot.
 * 
 * Miss typically occurs when:
 * - Player had a winning combination but played safe
 * - Player missed a tactical shot that would gain material
 * - Player played positionally but missed a tactic
 */

import { MarkerType } from '../../types/index.js';

export const MISS_THRESHOLDS = {
  // ===========================================
  // Basic Classification Thresholds
  // ===========================================
  
  /** Minimum centipawn loss for a miss */
  MIN_CP_LOSS: 100, // 1 pawn
  
  /** Maximum centipawn loss before becoming a mistake */
  MAX_CP_LOSS: 150, // 1.5 pawns
  
  // ===========================================
  // Tactical Miss Detection
  // ===========================================
  
  /** Best move was a capture */
  MISSED_CAPTURE_THRESHOLD: 100,
  
  /** Best move was a check */
  MISSED_CHECK_THRESHOLD: 100,
  
  /** Best move was a fork */
  MISSED_FORK_THRESHOLD: 100,
  
  /** Best move won material */
  MISSED_MATERIAL_GAIN_THRESHOLD: 100,
  
  // ===========================================
  // Winning Move Detection
  // ===========================================
  
  /** Player was clearly winning (eval) but didn't find killer blow */
  WINNING_POSITION_THRESHOLD: 200, // +2 pawns
  
  /** Missed move that would have ended the game faster */
  MISSED_WINNING_SEQUENCE: 150,
  
  /** Best move created overwhelming advantage */
  CRUSHING_ADVANTAGE_THRESHOLD: 300,
  
  // ===========================================
  // Context Adjustments
  // ===========================================
  
  /** Opening phase adjustments (moves 1-8) */
  OPENING_FORGIVENESS: 0.8, // 20% more lenient
  
  /** Endgame adjustments (move 40+) */
  ENDGAME_FORGIVENESS: 0.85, // 15% more lenient
  
  /** Middlegame - slight forgiveness for complex positions */
  MIDDLEGAME_FORGIVENESS: 0.95,
  
  // ===========================================
  // Anti-False-Positive Filters
  // ===========================================
  
  /** Don't mark as miss if player was already winning easily */
  SKIP_IF_ALREADY_WINNING: true,
  ALREADY_WINNING_THRESHOLD: 500, // +5 pawns
  
  /** Don't mark as miss in clearly losing positions */
  LOSING_POSITION_THRESHOLD: -200,
  
  /** Minimum move number for miss classification */
  MIN_MOVE_NUMBER: 5,
  
  /** Only count as miss if best move was tactical */
  REQUIRE_TACTICAL_BEST_MOVE: true,
  
} as const;

/**
 * Types of misses for classification
 */
export enum MissType {
  TACTICAL = 'tactical',
  MISSED_CAPTURE = 'missed_capture',
  MISSED_CHECK = 'missed_check',
  MISSED_FORK = 'missed_fork',
  MISSED_WINNING_MOVE = 'missed_winning_move',
  MISSED_COMBINATION = 'missed_combination',
  GENERAL = 'general',
}

/**
 * Result of miss detection
 */
export interface MissResult {
  isMiss: boolean;
  type?: MissType;
  reason?: string;
  centipawnLoss: number;
  missedMoveWas?: string;
  suggestedMarker?: MarkerType;
}

