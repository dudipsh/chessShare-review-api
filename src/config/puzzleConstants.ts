/**
 * Puzzle Extraction Constants
 */

// ═══════════════════════════════════════════════════════════════════════
// PUZZLE CRITERIA CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

// Threshold for skipping puzzles from lost positions (centipawns)
// If player is losing by more than this, don't create puzzle
// 200cp = 2 pawns - positions worse than this are considered "lost"
export const PUZZLE_MAX_LOSING_EVAL = 200;

// Threshold for skipping puzzles from winning positions (centipawns)
// If player is winning by more than this, don't create puzzle (position already won)
// 600cp = 6 pawns - positions better than this don't need puzzles
export const PUZZLE_MAX_WINNING_EVAL = 600;

// Maximum mistake puzzles per game
// Generate 3-5 puzzles per game for better practice variety
export const MAX_MISTAKE_PUZZLES_PER_GAME = 5;

// Maximum positive puzzles (brilliant/great moves) per game
export const MAX_POSITIVE_PUZZLES_PER_GAME = 2;

// Minimum puzzles to generate if possible
export const MIN_PUZZLES_TARGET = 3;

// Minimum centipawn loss to create a puzzle (only significant mistakes)
// 100cp = 1 pawn - only real mistakes, not small inaccuracies
export const PUZZLE_MIN_CP_LOSS = 100;

// Minimum move number to create puzzles (skip opening phase)
// Opening mistakes are often theoretical, not tactical
export const PUZZLE_MIN_MOVE_NUMBER = 6;

// Maximum missed tactics puzzles per game
export const MAX_MISSED_TACTICS_PER_GAME = 3;

// Minimum material gain for a tactic to be considered "puzzle-worthy" (centipawns)
// 100cp = 1 pawn - must win at least a pawn
export const PUZZLE_MIN_MATERIAL_GAIN = 100;

// Minimum evaluation swing for missed tactics (centipawns)
// The difference between playing the best move vs the played move
export const MISSED_TACTIC_MIN_SWING = 150;

// Bonus added to player rating to calculate puzzle rating
// User rating + 300 for challenging but achievable puzzles
export const PUZZLE_RATING_BONUS = 300;

// ═══════════════════════════════════════════════════════════════════════
// SOLUTION SEQUENCE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

// Maximum moves in a solution sequence
export const MAX_SOLUTION_MOVES = 8;

// Minimum evaluation advantage to consider puzzle "won"
export const MIN_ADVANTAGE_TO_END = 300;

// Centipawn threshold for "only move" detection
// Increased from 30 to 75 - allows for small differences between moves
// 75cp ≈ less than a pawn difference between best moves
export const UNIQUE_MOVE_THRESHOLD = 75;

// Analysis depth for puzzle solutions
export const PUZZLE_ANALYSIS_DEPTH = 18;

// ═══════════════════════════════════════════════════════════════════════
// QUALITY SCORING
// ═══════════════════════════════════════════════════════════════════════

export const QUALITY_SCORE = {
  HAS_TACTICAL_THEME: 30,
  MATERIAL_GAIN_100CP: 20,
  UNIQUE_BEST_MOVE: 25,
  SOLUTION_LENGTH_2_4: 15,
  CLEAR_EVAL_SWING: 10,
} as const;

// Minimum quality score for a puzzle to be included
export const MIN_QUALITY_SCORE = 50;

// ═══════════════════════════════════════════════════════════════════════
// PIECE VALUES
// ═══════════════════════════════════════════════════════════════════════

export const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};
