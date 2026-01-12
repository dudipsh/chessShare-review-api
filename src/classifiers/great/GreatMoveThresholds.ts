/**
 * Great Move Detection Thresholds
 * Centralized configuration for identifying great moves
 * 
 * Great moves are forcing tactical moves that are near-optimal:
 * - Checks that create significant pressure
 * - Captures that win material or create tactical threats
 * - Forcing moves that limit opponent options
 */

export const GREAT_MOVE_THRESHOLDS = {
  // ===========================================
  // Basic Classification Thresholds
  // ===========================================
  
  /** Maximum centipawn loss for a move to be considered "great" */
  MAX_CP_LOSS: 25,
  
  /** Stricter threshold for regular moves (non-tactical) */
  MAX_CP_LOSS_REGULAR: 15,
  
  /** Slightly relaxed threshold for tactical captures */
  MAX_CP_LOSS_FOR_CAPTURES: 30,
  
  // ===========================================
  // Check Move Detection
  // ===========================================
  
  /** Check moves are always tactical and forcing */
  CHECK_IS_FORCING: true,
  
  /** Maximum cp loss for a check to qualify as great */
  CHECK_MAX_CP_LOSS: 25,
  
  /** Minimum advantage gained from the check (eval swing) */
  CHECK_MIN_EVAL_GAIN: 0, // Any non-losing check can be great
  
  // ===========================================
  // Capture Detection
  // ===========================================
  
  /** Capture + Check is always strong */
  CAPTURE_WITH_CHECK_BONUS: true,
  
  /** Maximum cp loss for tactical capture */
  CAPTURE_MAX_CP_LOSS: 30,
  
  /** Maximum cp loss for capture with check */
  CAPTURE_CHECK_MAX_CP_LOSS: 35,
  
  // ===========================================
  // Forcing Move Patterns
  // ===========================================
  
  /** Moves that create discovered attacks */
  DISCOVERED_ATTACK_BONUS: true,
  
  /** Moves that create pins */
  PIN_CREATION_BONUS: true,
  
  /** Moves that restrict king movement */
  KING_RESTRICTION_BONUS: true,
  
  /** Maximum cp loss for forcing moves with bonuses */
  FORCING_MOVE_MAX_CP_LOSS: 30,
  
  // ===========================================
  // Anti-False-Positive Filters
  // ===========================================
  
  /** Reject if it's a simple recapture */
  REJECT_SIMPLE_RECAPTURES: false, // Recaptures can still be great
  
  /** Reject if opponent has only one legal response */
  REJECT_IF_OPPONENT_FORCED: false, // Forcing opponent is good
  
  /** Minimum move number for great classification (avoid opening theory) */
  MIN_MOVE_NUMBER: 5,
  
  /** Reject checks in obvious checkmate sequences */
  REJECT_TRIVIAL_MATE_CHECKS: true,
  
} as const;

/**
 * Types of great moves for classification
 */
export enum GreatMoveType {
  CHECK = 'check',
  CAPTURE = 'capture',
  CAPTURE_CHECK = 'capture_check',
  DISCOVERED_ATTACK = 'discovered_attack',
  PIN_CREATION = 'pin',
  FORCING_MOVE = 'forcing',
}

/**
 * Result of great move detection
 */
export interface GreatMoveResult {
  isGreat: boolean;
  type?: GreatMoveType;
  reason?: string;
  centipawnLoss: number;
}

