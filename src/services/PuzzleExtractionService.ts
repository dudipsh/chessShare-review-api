/**
 * PuzzleExtractionService
 * Extracts mistake puzzles and missed tactics from game evaluations
 *
 * Puzzle Types:
 * - Mistake puzzles: Positions where player made a mistake (blunder, mistake, inaccuracy)
 * - Missed Tactics: Positions where there was a brilliant/great tactic available but player MISSED it
 * - Positive puzzles: Brilliant/great moves the player found
 */

import { Chess, type Square } from 'chess.js';
import type { MoveEvaluation } from '../types/index.js';
import type { PersonalMistakeRecord } from '../types/puzzle.types.js';
import { convertLegacyTheme } from '../types/puzzle.types.js';
import { tacticalThemeService } from './TacticalThemeService.js';
import {
  PUZZLE_MAX_WINNING_EVAL,
  MAX_MISTAKE_PUZZLES_PER_GAME,
  MAX_POSITIVE_PUZZLES_PER_GAME,
  PUZZLE_MIN_CP_LOSS,
  PUZZLE_MIN_MOVE_NUMBER,
  MAX_MISSED_TACTICS_PER_GAME,
  PUZZLE_MIN_MATERIAL_GAIN,
  MISSED_TACTIC_MIN_SWING,
  PUZZLE_RATING_BONUS,
  PIECE_VALUES,
} from '../config/puzzleConstants.js';

// ═══════════════════════════════════════════════════════════════════════
// Tactical Theme Quality Filter
// Only puzzles with these themes are interesting enough to include
// ═══════════════════════════════════════════════════════════════════════

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
function isValidTacticalTheme(theme: string | null | undefined): boolean {
  if (!theme) return false;
  return VALID_TACTICAL_THEMES.includes(theme);
}

/**
 * Check if a puzzle should be included based on theme quality
 */
function shouldIncludePuzzle(
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

export class PuzzleExtractionService {
  /**
   * Extract mistake puzzles from game evaluations
   * Implements DYNAMIC winning position logic:
   * - If already have 3+ puzzles: skip winning positions (+600cp)
   * - If have < 3 puzzles: include winning positions (to reach 3 minimum)
   *
   * Also detects tactical themes and filters trivial puzzles
   */
  extractMistakesFromEvaluations(
    evaluations: Map<string, MoveEvaluation>,
    playerColor: 'white' | 'black',
    openingName?: string,
    gameRating?: number
  ): PersonalMistakeRecord[] {
    const mistakes: PersonalMistakeRecord[] = [];
    const evaluationsArray = Array.from(evaluations.values());

    evaluationsArray.forEach((evaluation) => {
      // Use string comparison (case-insensitive) for consistency
      const markerTypeLower = String(evaluation.markerType || '').toLowerCase();
      const isMistake = ['inaccuracy', 'mistake', 'miss', 'blunder'].includes(
        markerTypeLower
      );

      if (!isMistake) return;

      // Determine whose move it is from the FEN (position BEFORE the move)
      const fenParts = evaluation.fen.split(' ');
      const isWhiteMove = fenParts[1] === 'w';
      const isPlayerMove =
        (playerColor === 'white' && isWhiteMove) ||
        (playerColor === 'black' && !isWhiteMove);

      // Extract move number from FEN (6th field is fullmove number)
      const moveNumber = parseInt(fenParts[5], 10) || 1;

      if (!isPlayerMove) return;

      // Check current puzzle count for dynamic logic
      const currentPuzzleCount = mistakes.length;

      // Skip opening phase (first N moves)
      if (moveNumber < PUZZLE_MIN_MOVE_NUMBER) {
        return;
      }

      // Skip if position was already badly losing
      // EXCEPTION: Always create puzzles for BLUNDERS (unless facing mate)
      const evalBefore = evaluation.evaluationBefore || 0;
      const playerEval = playerColor === 'white' ? evalBefore : -evalBefore;
      const isBlunder = markerTypeLower === 'blunder';

      // ✅ Skip positions where player is facing mate or heavily losing
      // No puzzle makes sense when the game is already decided
      const isMateAgainstPlayer = playerEval < -90000;
      const isHeavilyLosing = playerEval < -500; // Losing by more than 5 pawns

      if (isMateAgainstPlayer || isHeavilyLosing) {
        return; // Don't create puzzle from lost positions (even for blunders)
      }

      // DYNAMIC WINNING POSITION LOGIC
      // Skip winning positions if we have enough puzzles (except blunders)
      const shouldSkipWinningPosition =
        !isBlunder &&
        currentPuzzleCount >= MAX_MISTAKE_PUZZLES_PER_GAME &&
        playerEval > PUZZLE_MAX_WINNING_EVAL;

      if (shouldSkipWinningPosition) {
        return;
      }

      // Limit total puzzles per game (except blunders)
      if (!isBlunder && mistakes.length >= MAX_MISTAKE_PUZZLES_PER_GAME) {
        return;
      }

      // Require minimum centipawn loss
      let cpLoss = evaluation.centipawnLoss || 0;

      // Ensure cpLoss matches marker severity
      const MARKER_MIN_CP: Record<string, number> = {
        'miss': 100,
        'mistake': 150,
        'blunder': 250,
      };
      const minCpForMarker = MARKER_MIN_CP[markerTypeLower] || 0;
      if (cpLoss < minCpForMarker) {
        cpLoss = minCpForMarker;
      }

      if (cpLoss < PUZZLE_MIN_CP_LOSS) {
        return;
      }

      // Skip if played move IS the best move
      const playedMove = evaluation.move;
      const bestMove = evaluation.bestMove;
      if (playedMove === bestMove) {
        return;
      }

      // Also check if SAN converts to same UCI
      try {
        const chess = new Chess(evaluation.fen);
        const moveResult = chess.move(playedMove);
        if (moveResult) {
          const playedUci =
            moveResult.from + moveResult.to + (moveResult.promotion || '');
          if (
            playedUci === bestMove ||
            playedUci.slice(0, 4) === bestMove.slice(0, 4)
          ) {
            return;
          }
        }
      } catch {
        // Ignore conversion errors
      }

      // Quality filtering - skip trivial recaptures
      if (this._isTrivialRecapture(evaluation.fen, bestMove)) {
        return;
      }

      // Detect tactical theme for the best move
      const themeResult = tacticalThemeService.detectTheme(
        evaluation.fen,
        bestMove,
        evaluation.evaluationBefore,
        evaluation.evaluationAfter
      );

      // Calculate material gain from best move
      const materialGain = tacticalThemeService.calculateMaterialGain(
        evaluation.fen,
        bestMove,
        evaluation.evaluationBefore,
        evaluation.evaluationAfter
      );

      const markerType = evaluation.markerType.toLowerCase() as
        | 'inaccuracy'
        | 'mistake'
        | 'blunder'
        | 'miss';

      // Convert legacy theme to new theme ID
      const themeId = themeResult.theme
        ? convertLegacyTheme(themeResult.theme)
        : undefined;

      // Quality filter: skip boring puzzles without tactical themes
      // (unless they're blunders or have significant material gain)
      if (!shouldIncludePuzzle(themeId, materialGain, isBlunder)) {
        return;
      }

      mistakes.push({
        fen: evaluation.fen,
        played_move: evaluation.move,
        best_move: evaluation.bestMove,
        evaluation_loss: cpLoss,
        marker_type: markerType,
        move_number: moveNumber,
        player_color: playerColor,
        opening_name: openingName,
        game_rating: gameRating,
        puzzle_rating: gameRating
          ? gameRating + PUZZLE_RATING_BONUS
          : undefined,
        is_positive_puzzle: false,
        is_missed_tactic: false,
        tactical_theme: themeId,
        material_gain: materialGain,
      });
    });

    return mistakes;
  }

  /**
   * Extract missed tactics from evaluations
   *
   * A missed tactic is when:
   * 1. There was a brilliant/great tactical opportunity in the position
   * 2. The player played a DIFFERENT move (not the best move)
   * 3. The best move would have gained significant material or advantage
   */
  extractMissedTactics(
    evaluations: Map<string, MoveEvaluation>,
    playerColor: 'white' | 'black',
    openingName?: string,
    gameRating?: number
  ): PersonalMistakeRecord[] {
    const missedTactics: PersonalMistakeRecord[] = [];
    const evaluationsArray = Array.from(evaluations.values());

    evaluationsArray.forEach((evaluation) => {
      const markerTypeLower = String(evaluation.markerType || '').toLowerCase();

      // Skip if already marked as brilliant/great (player FOUND it)
      if (markerTypeLower === 'brilliant' || markerTypeLower === 'great') {
        return;
      }

      // Only look at positions where player made a suboptimal move
      const isPotentialMissedTactic = ['inaccuracy', 'miss', 'good'].includes(markerTypeLower);
      if (!isPotentialMissedTactic) return;

      // Determine whose move it is from the FEN
      const fenParts = evaluation.fen.split(' ');
      const isWhiteMove = fenParts[1] === 'w';
      const moveNumber = parseInt(fenParts[5], 10) || 1;

      // Check if it's the player's move
      const isPlayerMove =
        (playerColor === 'white' && isWhiteMove) ||
        (playerColor === 'black' && !isWhiteMove);

      if (!isPlayerMove) return;

      // Skip opening phase
      if (moveNumber < PUZZLE_MIN_MOVE_NUMBER) return;

      // Skip if already at max
      if (missedTactics.length >= MAX_MISSED_TACTICS_PER_GAME) return;

      // Calculate evaluation swing from player's perspective
      const evalBefore = evaluation.evaluationBefore || 0;
      const playerEvalBefore = playerColor === 'white' ? evalBefore : -evalBefore;

      // ✅ Skip positions where player is heavily losing or facing mate
      const isMateAgainstPlayer = playerEvalBefore < -90000;
      const isHeavilyLosing = playerEvalBefore < -500; // Losing by more than 5 pawns

      if (isMateAgainstPlayer || isHeavilyLosing) {
        return;
      }

      // Skip positions that are already heavily won
      if (playerEvalBefore > PUZZLE_MAX_WINNING_EVAL) return;

      // The player played a different move than the best move
      const playedMove = evaluation.move;
      const bestMove = evaluation.bestMove;

      // Check if they're different moves
      if (this._isSameMove(evaluation.fen, playedMove, bestMove)) {
        return;
      }

      // Check if the best move would have been a tactical shot
      const evalAfter = evaluation.evaluationAfter || 0;
      const themeResult = tacticalThemeService.detectTheme(
        evaluation.fen,
        bestMove,
        evalBefore,
        evalAfter
      );

      const materialGain = tacticalThemeService.calculateMaterialGain(
        evaluation.fen,
        bestMove,
        evalBefore,
        evalAfter
      );

      // Quality filter: only include if actually tactical
      const hasTacticalTheme = themeResult.theme && themeResult.confidence >= 50;
      const hasSignificantGain = materialGain >= PUZZLE_MIN_MATERIAL_GAIN;
      const hasEvalSwing = (evaluation.centipawnLoss || 0) >= MISSED_TACTIC_MIN_SWING;

      if (!hasTacticalTheme && !hasSignificantGain && !hasEvalSwing) {
        return;
      }

      // Filter out trivial recaptures
      if (this._isTrivialRecapture(evaluation.fen, bestMove)) {
        return;
      }

      // Check if best move is just a simple obvious capture
      if (this._isObviousCapture(evaluation.fen, bestMove) && !hasTacticalTheme) {
        return;
      }

      // Convert theme to new ID (don't default to 'advantage' - let filter decide)
      const themeId = themeResult.theme
        ? convertLegacyTheme(themeResult.theme)
        : undefined;

      // Quality filter: skip boring puzzles without tactical themes
      // Missed tactics should have a real tactical theme to be interesting
      if (!shouldIncludePuzzle(themeId, materialGain, false)) {
        return;
      }

      missedTactics.push({
        fen: evaluation.fen,
        played_move: playedMove,
        best_move: bestMove,
        evaluation_loss: evaluation.centipawnLoss || 0,
        marker_type: 'miss',
        move_number: moveNumber,
        player_color: playerColor,
        opening_name: openingName,
        game_rating: gameRating,
        puzzle_rating: gameRating
          ? gameRating + PUZZLE_RATING_BONUS
          : undefined,
        is_positive_puzzle: false,
        is_missed_tactic: true,
        tactical_theme: themeId,
        material_gain: materialGain,
      });
    });

    return missedTactics;
  }

  /**
   * Extract positive puzzles (brilliant tactical finds)
   *
   * These are moves the player FOUND - they played a brilliant move
   * The puzzle is to replay and appreciate the tactic they found
   *
   * NOTE: Only 'brilliant' moves create puzzles, not 'great' moves
   * Great moves are good but not puzzle-worthy
   */
  extractPositivePuzzles(
    evaluations: Map<string, MoveEvaluation>,
    playerColor: 'white' | 'black',
    openingName?: string,
    gameRating?: number
  ): PersonalMistakeRecord[] {
    const positivePuzzles: PersonalMistakeRecord[] = [];
    const evaluationsArray = Array.from(evaluations.values());

    evaluationsArray.forEach((evaluation) => {
      const markerTypeLower = String(evaluation.markerType || '').toLowerCase();

      // Only extract BRILLIANT moves (not great - those aren't puzzle-worthy)
      if (markerTypeLower !== 'brilliant') {
        return;
      }

      // Determine whose move it is from the FEN
      const fenParts = evaluation.fen.split(' ');
      const isWhiteMove = fenParts[1] === 'w';
      const moveNumber = parseInt(fenParts[5], 10) || 1;

      // Check if it's the player's move
      const isPlayerMove =
        (playerColor === 'white' && isWhiteMove) ||
        (playerColor === 'black' && !isWhiteMove);

      if (!isPlayerMove) return;

      // Skip opening phase
      if (moveNumber < PUZZLE_MIN_MOVE_NUMBER) return;

      // Skip if already at max
      if (positivePuzzles.length >= MAX_POSITIVE_PUZZLES_PER_GAME) return;

      // ✅ CRITICAL: Skip if player is in a losing position (including mate threats)
      // No point showing a "brilliant" move if the opponent is about to mate us
      const evalBefore = evaluation.evaluationBefore || 0;
      const playerEval = playerColor === 'white' ? evalBefore : -evalBefore;

      // Check for mate scores (typically > 90000 or < -90000)
      const isMateAgainstPlayer = playerEval < -90000;
      const isHeavilyLosing = playerEval < -500; // Losing by more than 5 pawns

      if (isMateAgainstPlayer || isHeavilyLosing) {
        return; // Don't create puzzle from lost positions
      }

      // Get the played move (which is the best move for positive puzzles)
      const playedMove = evaluation.move;
      const bestMove = evaluation.bestMove;

      // Detect tactical theme (evalBefore already declared above)
      const evalAfter = evaluation.evaluationAfter || 0;
      const themeResult = tacticalThemeService.detectTheme(
        evaluation.fen,
        playedMove,
        evalBefore,
        evalAfter
      );

      // Convert theme to new ID
      const themeId = themeResult?.theme
        ? convertLegacyTheme(themeResult.theme)
        : undefined;

      // Calculate material gain
      const materialGain = tacticalThemeService.calculateMaterialGain(
        evaluation.fen,
        playedMove
      );

      // Quality filter for positive puzzles - but be more lenient
      // since brilliant/great moves are already special
      // Only filter if no tactical theme AND no significant material gain
      if (!shouldIncludePuzzle(themeId, materialGain, false)) {
        return;
      }

      positivePuzzles.push({
        fen: evaluation.fen,
        played_move: playedMove,
        best_move: bestMove || playedMove,
        evaluation_loss: 0,
        marker_type: markerTypeLower as 'brilliant' | 'great',
        move_number: moveNumber,
        player_color: playerColor,
        opening_name: openingName,
        game_rating: gameRating,
        puzzle_rating: gameRating
          ? gameRating + PUZZLE_RATING_BONUS
          : undefined,
        is_positive_puzzle: true,
        is_missed_tactic: false,
        tactical_theme: themeId,
        material_gain: materialGain,
      });
    });

    return positivePuzzles;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Quality Filter Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Check if a move is a trivial recapture
   */
  private _isTrivialRecapture(fen: string, bestMove: string): boolean {
    try {
      const chess = new Chess(fen);
      const toSquare = bestMove.slice(2, 4) as Square;

      // Check if the target square has a piece (it's a capture)
      const targetPiece = chess.get(toSquare);
      if (!targetPiece) return false;

      const fromSquare = bestMove.slice(0, 2) as Square;
      const movingPiece = chess.get(fromSquare);

      if (!movingPiece || !targetPiece) return false;

      // If we're capturing with a queen against a pawn, it's likely trivial
      if (movingPiece.type === 'q' && targetPiece.type === 'p') {
        const moves = chess.moves({ verbose: true });
        const captureMoves = moves.filter(m => m.captured);

        // If there's only one capture available, it might be trivial
        if (captureMoves.length === 1) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if a move is an obvious capture (no tactics involved)
   */
  private _isObviousCapture(fen: string, bestMove: string): boolean {
    try {
      const chess = new Chess(fen);
      const toSquare = bestMove.slice(2, 4) as Square;

      const targetPiece = chess.get(toSquare);
      if (!targetPiece) return false;

      const fromSquare = bestMove.slice(0, 2) as Square;
      const movingPiece = chess.get(fromSquare);
      if (!movingPiece) return false;

      const targetValue = PIECE_VALUES[targetPiece.type] || 0;
      const movingValue = PIECE_VALUES[movingPiece.type] || 0;

      // If capturing a piece worth more than our piece, check if it's defended
      if (targetValue >= movingValue) {
        const promotion = bestMove.length > 4 ? bestMove[4] as 'q' | 'r' | 'b' | 'n' : undefined;
        chess.move({ from: fromSquare, to: toSquare, promotion });

        // Check if opponent can recapture
        const recaptures = chess.moves({ verbose: true }).filter(m => m.to === toSquare);

        if (recaptures.length === 0) {
          // No recapture possible - this is an obvious free piece
          return targetValue <= PIECE_VALUES.p;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if two moves are the same (handling SAN vs UCI formats)
   */
  private _isSameMove(fen: string, move1: string, move2: string): boolean {
    if (move1 === move2) return true;

    try {
      const chess = new Chess(fen);

      // Try to convert move1 to UCI
      let uci1 = move1;
      try {
        const result1 = chess.move(move1);
        if (result1) {
          uci1 = result1.from + result1.to + (result1.promotion || '');
          chess.undo();
        }
      } catch {
        // Keep original
      }

      // Try to convert move2 to UCI
      let uci2 = move2;
      try {
        const result2 = chess.move(move2);
        if (result2) {
          uci2 = result2.from + result2.to + (result2.promotion || '');
          chess.undo();
        }
      } catch {
        // Keep original
      }

      // Compare UCI formats
      return uci1.slice(0, 4) === uci2.slice(0, 4);
    } catch {
      return move1 === move2;
    }
  }
}

// Export singleton instance
export const puzzleExtractionService = new PuzzleExtractionService();
