/**
 * Game Review Constants - All values in centipawns (100cp = 1 pawn)
 * Adapted for server-side execution
 */

import { MarkerType, GameReviewConfig } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════
// MOVE CLASSIFICATION THRESHOLDS (Most important - edit these!)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Winner/Loser accuracy adjustment multipliers
 */
export const ACCURACY_ADJUSTMENT = {
  WINNER_PENALTY: 0.9, // Minor reduction for winner (10% reduction)
  LOSER_PENALTY: 1.1, // Minor increase for loser (10% increase)
  WINNER_BEST_MOVE_PENALTY: 0, // NO penalty for perfect moves
  MAX_EVAL_CHANGE_FOR_BEST: 30, // Max evaluation worsening allowed for "best" move
} as const;

/**
 * Move classification by centipawn loss (calibrated to Chess.com)
 * Chess.com NAGs: $1=!, $6=?!, $9=✖, $2=?, $4=??
 */
export const MOVE_CLASSIFICATION_THRESHOLDS = {
  BEST: 10,       // 0-10cp = Best move ($1 !)
  GREAT: 15,      // 10-15cp = Great move (checks, winning moves)
  GOOD: 30,       // 15-30cp = Good move (no NAG in Chess.com)
  INACCURACY: 50, // 30-50cp = Inaccuracy ($6 ?!)
  MISS: 100,      // 50-100cp = Miss ($9 ✖) - tactical miss
  MISTAKE: 150,   // 100-150cp = Mistake ($2 ?)
  BLUNDER: 200,   // 200+cp = Blunder ($4 ??)
} as const;

/**
 * Forgiveness by game phase (multiplier applied to centipawn loss)
 * Reduced to match Chess.com's stricter classification
 */
export const GAME_PHASE_FORGIVENESS = {
  OPENING: 0.95,      // Moves 1-8: 5% forgiveness
  POST_OPENING: 1.0,  // Moves 9-15: No forgiveness
  MIDDLEGAME: 1.0,    // Moves 16-40: No forgiveness
  ENDGAME: 1.0,       // Moves 41+: No forgiveness
} as const;

/**
 * Move ranges for each game phase
 */
export const GAME_PHASE_RANGES = {
  OPENING_END: 8,
  POST_OPENING_END: 20,
  MIDDLEGAME_END: 25,
} as const;

/**
 * Losing position adjustment
 */
export const LOSING_POSITION_ADJUSTMENT = {
  THRESHOLD: -100, // cp from player's perspective
  MAX_LOSS_FOR_PENALTY: 12, // cp
  PENALTY: 15, // cp (= GOOD move)
} as const;

/**
 * Get forgiveness multiplier for a given move number
 */
export function getGamePhaseForgiveness(moveNumber: number): number {
  if (moveNumber <= GAME_PHASE_RANGES.OPENING_END) {
    return GAME_PHASE_FORGIVENESS.OPENING;
  }
  if (moveNumber <= GAME_PHASE_RANGES.POST_OPENING_END) {
    return GAME_PHASE_FORGIVENESS.POST_OPENING;
  }
  if (moveNumber <= GAME_PHASE_RANGES.MIDDLEGAME_END) {
    return GAME_PHASE_FORGIVENESS.MIDDLEGAME;
  }
  return GAME_PHASE_FORGIVENESS.ENDGAME;
}

/**
 * Great Move detection thresholds
 */
export const GREAT_MOVE_THRESHOLDS = {
  MAX_DELTA: 15, // Maximum cp loss for Great Move
  OPTIMAL_DELTA: 10, // Ideal range for Great Move
} as const;

// ═══════════════════════════════════════════════════════════════════════
// MATE DETECTION
// ═══════════════════════════════════════════════════════════════════════

export const MATE_THRESHOLD = 97000;

// ═══════════════════════════════════════════════════════════════════════
// STOCKFISH ANALYSIS CONFIG (Server settings)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Live evaluation config (for real-time analysis)
 */
export const LIVE_EVALUATION_CONFIG = {
  MIN_DEPTH: 12,
  MAX_DEPTH: 20,
  TIMEOUT: 2500,
  USE_MOVETIME: true,
  MOVETIME: 1200,
  MIN_DEPTH_FOR_UPDATE: 10,
} as const;

/**
 * Game review analysis config (deep analysis)
 */
export const ANALYSIS_CONFIG = {
  MOVETIME: 1650,
  TIMEOUT: 10000,
  MIN_DEPTH_FOR_UPDATE: 10,
  MIN_DEPTH_FOR_EVALUATION_BAR: 12,
  STABLE_DEPTH: 14,
  USE_DEPTH: true,
  USE_PROGRESSIVE_DEPTH: true,
  PROGRESSIVE_DEPTH_START: 10,
  PROGRESSIVE_DEPTH_INCREMENT: -1,
  PROGRESSIVE_DEPTH_INCREMENT_EVERY: 12,
  PROGRESSIVE_DEPTH_MAX: 16,
  PROGRESSIVE_DEPTH_MIN: 10,
} as const;

/**
 * Default game review configuration
 */
export const DEFAULT_GAME_REVIEW_CONFIG: GameReviewConfig = {
  analysisDepth: 10,
  timeoutPerMove: ANALYSIS_CONFIG.TIMEOUT,
  enableProgressCallback: true,
  timeoutMultiplierPer40Moves: 1.0,
};

/**
 * Parallel analysis configuration (server-optimized)
 */
export const PARALLEL_ANALYSIS_CONFIG = {
  NUM_WORKERS: parseInt(process.env.STOCKFISH_POOL_SIZE || '4', 10),
  DEPTH_COMPENSATION_PER_WORKER: 0,
  MOVETIME_COMPENSATION_PER_WORKER: 100,
  HASH_SIZE_PER_WORKER: 64,
  THREADS_PER_WORKER: 1,
} as const;

/**
 * Calculate depth for a move based on move number (progressive depth)
 */
export function getProgressiveDepth(
  moveIndex: number,
  numWorkers: number = PARALLEL_ANALYSIS_CONFIG.NUM_WORKERS
): number {
  if (!ANALYSIS_CONFIG.USE_PROGRESSIVE_DEPTH) {
    const baseDepth = ANALYSIS_CONFIG.STABLE_DEPTH;
    const compensation =
      (numWorkers - 1) * PARALLEL_ANALYSIS_CONFIG.DEPTH_COMPENSATION_PER_WORKER;
    return baseDepth + compensation;
  }

  const {
    PROGRESSIVE_DEPTH_START,
    PROGRESSIVE_DEPTH_INCREMENT,
    PROGRESSIVE_DEPTH_INCREMENT_EVERY,
    PROGRESSIVE_DEPTH_MAX,
    PROGRESSIVE_DEPTH_MIN,
  } = ANALYSIS_CONFIG;

  const baseDepth =
    PROGRESSIVE_DEPTH_START +
    Math.floor(moveIndex / PROGRESSIVE_DEPTH_INCREMENT_EVERY) *
      PROGRESSIVE_DEPTH_INCREMENT;

  const compensation =
    (numWorkers - 1) * PARALLEL_ANALYSIS_CONFIG.DEPTH_COMPENSATION_PER_WORKER;
  const compensatedDepth = baseDepth + compensation;

  return Math.min(
    Math.max(compensatedDepth, PROGRESSIVE_DEPTH_MIN),
    PROGRESSIVE_DEPTH_MAX + compensation
  );
}

/**
 * Retry logic for failed analysis
 */
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BASE_WAIT_TIME: 2000,
  DEPTH_REDUCTION_PER_RETRY: 1,
  MIN_DEPTH: 6,
} as const;

/**
 * Progress delays
 */
export const PROGRESS_DELAYS = {
  BETWEEN_MOVES: 100,
  AFTER_BATCH: 200,
  BATCH_SIZE: 10,
  BETWEEN_POSITIONS: 100,
} as const;

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get marker type by centipawn loss
 */
export function getMarkerTypeByLoss(centipawnLoss: number): MarkerType {
  if (centipawnLoss <= MOVE_CLASSIFICATION_THRESHOLDS.BEST) {
    return MarkerType.BEST;
  }
  if (centipawnLoss <= MOVE_CLASSIFICATION_THRESHOLDS.GOOD) {
    return MarkerType.GOOD;
  }
  if (centipawnLoss <= MOVE_CLASSIFICATION_THRESHOLDS.INACCURACY) {
    return MarkerType.INACCURACY;
  }
  if (centipawnLoss <= MOVE_CLASSIFICATION_THRESHOLDS.MISS) {
    return MarkerType.MISS;
  }
  if (centipawnLoss <= MOVE_CLASSIFICATION_THRESHOLDS.MISTAKE) {
    return MarkerType.MISTAKE;
  }
  return MarkerType.BLUNDER;
}

/**
 * Check if evaluation is mate
 */
export function isMateScore(evaluation: number): boolean {
  return Math.abs(evaluation) >= MATE_THRESHOLD;
}

/**
 * Extract mate distance (e.g., M3 = 3, M-5 = -5)
 */
export function extractMateIn(evaluation: number): number | null {
  if (!isMateScore(evaluation)) return null;

  const sign = evaluation > 0 ? 1 : -1;
  const mateValue = Math.abs(evaluation);
  const mateIn = Math.round((100000 - mateValue) / 100);

  return sign * mateIn;
}

/**
 * Check if mate improved (shorter mate = better)
 */
export function isMateImproved(mateBefore: number, mateAfter: number): boolean {
  const mateInBefore = extractMateIn(mateBefore);
  const mateInAfter = extractMateIn(mateAfter);

  if (mateInBefore === null || mateInAfter === null) return false;

  if (
    (mateInBefore > 0 && mateInAfter > 0) ||
    (mateInBefore < 0 && mateInAfter < 0)
  ) {
    return Math.abs(mateInAfter) < Math.abs(mateInBefore);
  }

  return false;
}
