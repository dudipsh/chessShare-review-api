/**
 * Puzzle Quality Filters
 * Functions to determine if a puzzle is interesting enough to include
 */

// Valid tactical themes that make interesting puzzles (like Lichess)
const VALID_TACTICAL_THEMES = [
  // Tactical motifs
  'fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'doubleAttack',
  // Mating patterns
  'backRankMate', 'smotheredMate', 'mateIn1', 'mateIn2', 'mateIn3', 'mate',
  // Defensive/attacking motifs
  'deflection', 'decoy', 'clearance', 'sacrifice', 'interference',
  // Piece tactics
  'trappedPiece', 'hangingPiece', 'overloaded', 'undermining',
  // Special moves
  'zwischenzug', 'quietMove', 'desperado', 'intermezzo',
  // Pawn tactics
  'promotion', 'advancedPawn', 'passedPawn',
  // Discovery variations
  'discovery',
];

// Generic themes that don't represent specific tactics
const GENERIC_THEMES = ['advantage', 'crushing', 'endgame', 'equality', 'winning_material'];

// Minimum material gain (in centipawns) for puzzles with generic themes
const MIN_MATERIAL_FOR_GENERIC_THEME = 200; // 2 pawns worth

// Whether to require tactical themes (can be disabled for testing)
const REQUIRE_TACTICAL_THEME = true;

/**
 * Check if a theme is a valid tactical theme (not generic)
 */
export function isValidTacticalTheme(theme: string | null | undefined): boolean {
  if (!theme) return false;
  return VALID_TACTICAL_THEMES.includes(theme);
}

/**
 * Check if a puzzle should be included based on theme quality
 */
export function shouldIncludePuzzle(
  themeId: string | null | undefined,
  materialGain: number,
  isBlunder: boolean = false
): boolean {
  // Always include blunders (they're important to learn from)
  if (isBlunder) return true;

  // If we don't require tactical themes, include all
  if (!REQUIRE_TACTICAL_THEME) return true;

  // If has valid tactical theme, include
  if (isValidTacticalTheme(themeId)) return true;

  // If generic theme but has significant material gain, include
  if (themeId && GENERIC_THEMES.includes(themeId)) {
    return materialGain >= MIN_MATERIAL_FOR_GENERIC_THEME;
  }

  // If no theme at all but has significant material, include
  if (!themeId && materialGain >= MIN_MATERIAL_FOR_GENERIC_THEME) {
    return true;
  }

  // Otherwise, skip (boring puzzle)
  return false;
}
