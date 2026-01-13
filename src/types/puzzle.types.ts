/**
 * Puzzle Types for the Review API
 */

export type TacticalTheme =
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovery'
  | 'back_rank'
  | 'deflection'
  | 'trapped_piece'
  | 'winning_material'
  | 'mate_threat'
  | 'zwischenzug';

export interface TacticalThemeResult {
  theme: TacticalTheme | null;
  confidence: number; // 0-100
  description: string;
}

// Solution sequence move format
export interface SolutionMove {
  move: string; // UCI format: "e2e4"
  isUserMove: boolean; // true if player should make this move, false for opponent
  fen?: string; // Position before this move (optional, for validation)
}

export interface PersonalMistakeRecord {
  id?: string;
  user_id?: string;
  game_review_id?: string;
  fen: string;
  played_move: string;
  best_move: string;
  evaluation_loss?: number;
  marker_type:
    | 'inaccuracy'
    | 'mistake'
    | 'blunder'
    | 'miss'
    | 'brilliant'
    | 'great';
  move_number: number;
  player_color: 'white' | 'black';
  opening_name?: string;
  game_rating?: number;
  puzzle_rating?: number;
  is_positive_puzzle?: boolean;
  solution_sequence?: SolutionMove[];
  tactical_theme?: string | null;
  is_missed_tactic?: boolean;
  material_gain?: number;
  source?: 'game' | 'lichess';
  lichess_puzzle_id?: string;
}

export interface PuzzleExtractionRequest {
  reviewId: string;
  pgn: string;
  playerColor: 'white' | 'black';
  gameRating?: number;
  openingName?: string;
}

export interface ExtractedPuzzle {
  fen: string;
  playedMove: string;
  bestMove: string;
  solution: string[]; // UCI moves
  rating: number;
  themes: string[];
  type: 'mistake' | 'missed_tactic' | 'brilliant';
  moveNumber: number;
  evaluationSwing: number;
  materialGain: number;
}

export interface PuzzleExtractionResponse {
  puzzles: ExtractedPuzzle[];
  totalExtracted: number;
}

// Legacy theme mapping
export const LEGACY_THEME_MAPPING: Record<string, string> = {
  'fork': 'fork',
  'pin': 'pin',
  'skewer': 'skewer',
  'discovery': 'discoveredAttack',
  'back_rank': 'backRankMate',
  'deflection': 'deflection',
  'trapped_piece': 'trappedPiece',
  'winning_material': 'advantage',
  'mate_threat': 'mate',
  'zwischenzug': 'intermezzo',
};

/**
 * Convert legacy theme to new theme ID
 */
export function convertLegacyTheme(legacyTheme: string): string {
  return LEGACY_THEME_MAPPING[legacyTheme] || legacyTheme;
}
