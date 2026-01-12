/**
 * Inaccuracy Detection Thresholds
 * Centralized configuration for identifying inaccuracies
 * 
 * An inaccuracy is a small error that slightly worsens the position.
 * It's not as severe as a mistake but still suboptimal.
 * Typically loses 0.35-1.0 pawns worth of evaluation.
 */

import { MarkerType } from '../../types/index.js';

export const INACCURACY_THRESHOLDS = {
  // ===========================================
  // Basic Classification Thresholds
  // ===========================================
  
  /** Minimum centipawn loss for an inaccuracy */
  MIN_CP_LOSS: 35, // ~0.35 pawns
  
  /** Maximum centipawn loss before becoming a miss/mistake */
  MAX_CP_LOSS: 100, // 1 pawn
  
  // ===========================================
  // Context Adjustments
  // ===========================================
  
  /** Opening phase adjustments (moves 1-8) */
  OPENING_FORGIVENESS: 0.8, // 20% more lenient
  
  /** Post-opening (moves 9-15) */
  POST_OPENING_FORGIVENESS: 0.9, // 10% more lenient
  
  /** Middlegame - standard */
  MIDDLEGAME_FORGIVENESS: 1.0,
  
  /** Endgame adjustments (move 40+) */
  ENDGAME_FORGIVENESS: 0.85, // 15% more lenient
  
  // ===========================================
  // Anti-False-Positive Filters
  // ===========================================
  
  /** Skip if position is already clearly winning/losing */
  SKIP_EXTREME_POSITIONS: true,
  EXTREME_POSITION_THRESHOLD: 500, // +/- 5 pawns
  
  /** Minimum move number for inaccuracy classification */
  MIN_MOVE_NUMBER: 3,
  
} as const;

/**
 * Types of inaccuracies for classification
 */
export enum InaccuracyType {
  POSITIONAL = 'positional',
  TACTICAL = 'tactical',
  DEVELOPMENT = 'development',
  GENERAL = 'general',
}

/**
 * Result of inaccuracy detection
 */
export interface InaccuracyResult {
  isInaccuracy: boolean;
  type?: InaccuracyType;
  reason?: string;
  centipawnLoss: number;
  suggestedMarker?: MarkerType;
}

