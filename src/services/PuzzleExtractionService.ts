/**
 * PuzzleExtractionService
 * Extracts mistake puzzles and missed tactics from game evaluations
 */

import { Chess } from 'chess.js';
import type { MoveEvaluation } from '../types/index.js';
import type { PersonalMistakeRecord } from '../types/puzzle.types.js';
import { convertLegacyTheme } from '../types/puzzle.types.js';
import { tacticalThemeService } from './TacticalThemeService.js';
import { shouldIncludePuzzle } from './puzzleQualityFilters.js';
import {
  isTrivialRecapture,
  isObviousCapture,
  isSameMove,
  extractMoveInfo,
  isPositionTooLost,
  getPlayerEval,
} from './puzzleEvaluationHelpers.js';
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
} from '../config/puzzleConstants.js';

// Minimum centipawn loss per marker type
const MARKER_MIN_CP: Record<string, number> = {
  'miss': 100,
  'mistake': 150,
  'blunder': 250,
};

export class PuzzleExtractionService {
  /**
   * Extract mistake puzzles from game evaluations
   */
  extractMistakesFromEvaluations(
    evaluations: Map<string, MoveEvaluation>,
    playerColor: 'white' | 'black',
    openingName?: string,
    gameRating?: number
  ): PersonalMistakeRecord[] {
    const mistakes: PersonalMistakeRecord[] = [];

    for (const evaluation of evaluations.values()) {
      const markerTypeLower = String(evaluation.markerType || '').toLowerCase();
      const isMistake = ['inaccuracy', 'mistake', 'miss', 'blunder'].includes(markerTypeLower);
      if (!isMistake) continue;

      const { moveNumber, isPlayerMove } = extractMoveInfo(evaluation.fen, playerColor);
      if (!isPlayerMove || moveNumber < PUZZLE_MIN_MOVE_NUMBER) continue;

      const evalBefore = evaluation.evaluationBefore || 0;
      const playerEval = getPlayerEval(evalBefore, playerColor);
      const isBlunder = markerTypeLower === 'blunder';

      // Skip heavily losing positions
      if (isPositionTooLost(playerEval)) continue;

      // Dynamic winning position logic
      if (!isBlunder && mistakes.length >= MAX_MISTAKE_PUZZLES_PER_GAME && playerEval > PUZZLE_MAX_WINNING_EVAL) {
        continue;
      }

      // Limit total puzzles (except blunders)
      if (!isBlunder && mistakes.length >= MAX_MISTAKE_PUZZLES_PER_GAME) continue;

      // Check centipawn loss
      let cpLoss = evaluation.centipawnLoss || 0;
      const minCpForMarker = MARKER_MIN_CP[markerTypeLower] || 0;
      if (cpLoss < minCpForMarker) cpLoss = minCpForMarker;
      if (cpLoss < PUZZLE_MIN_CP_LOSS) continue;

      // Skip if played move is the best move
      const playedMove = evaluation.move;
      const bestMove = evaluation.bestMove;
      if (this._areSameMoves(evaluation.fen, playedMove, bestMove)) continue;

      // Quality filtering
      if (isTrivialRecapture(evaluation.fen, bestMove)) continue;

      // Detect tactical theme
      const themeResult = tacticalThemeService.detectTheme(
        evaluation.fen, bestMove, evaluation.evaluationBefore, evaluation.evaluationAfter
      );
      const materialGain = tacticalThemeService.calculateMaterialGain(
        evaluation.fen, bestMove, evaluation.evaluationBefore, evaluation.evaluationAfter
      );

      const themeId = themeResult.theme ? convertLegacyTheme(themeResult.theme) : undefined;
      if (!shouldIncludePuzzle(themeId, materialGain, isBlunder)) continue;

      mistakes.push(this._createPuzzleRecord(evaluation, {
        cpLoss,
        markerType: markerTypeLower as 'inaccuracy' | 'mistake' | 'blunder' | 'miss',
        moveNumber,
        playerColor,
        openingName,
        gameRating,
        themeId,
        materialGain,
        isPositive: false,
        isMissedTactic: false,
      }));
    }

    return mistakes;
  }

  /**
   * Extract missed tactics from evaluations
   */
  extractMissedTactics(
    evaluations: Map<string, MoveEvaluation>,
    playerColor: 'white' | 'black',
    openingName?: string,
    gameRating?: number
  ): PersonalMistakeRecord[] {
    const missedTactics: PersonalMistakeRecord[] = [];

    for (const evaluation of evaluations.values()) {
      const markerTypeLower = String(evaluation.markerType || '').toLowerCase();

      // Skip if player found it or it's not a potential missed tactic
      if (markerTypeLower === 'brilliant' || markerTypeLower === 'great') continue;
      if (!['inaccuracy', 'miss', 'good'].includes(markerTypeLower)) continue;

      const { moveNumber, isPlayerMove } = extractMoveInfo(evaluation.fen, playerColor);
      if (!isPlayerMove || moveNumber < PUZZLE_MIN_MOVE_NUMBER) continue;
      if (missedTactics.length >= MAX_MISSED_TACTICS_PER_GAME) continue;

      const evalBefore = evaluation.evaluationBefore || 0;
      const playerEvalBefore = getPlayerEval(evalBefore, playerColor);

      if (isPositionTooLost(playerEvalBefore)) continue;
      if (playerEvalBefore > PUZZLE_MAX_WINNING_EVAL) continue;

      const playedMove = evaluation.move;
      const bestMove = evaluation.bestMove;
      if (isSameMove(evaluation.fen, playedMove, bestMove)) continue;

      // Check if best move would have been tactical
      const evalAfter = evaluation.evaluationAfter || 0;
      const themeResult = tacticalThemeService.detectTheme(evaluation.fen, bestMove, evalBefore, evalAfter);
      const materialGain = tacticalThemeService.calculateMaterialGain(evaluation.fen, bestMove, evalBefore, evalAfter);

      const hasTacticalTheme = themeResult.theme && themeResult.confidence >= 50;
      const hasSignificantGain = materialGain >= PUZZLE_MIN_MATERIAL_GAIN;
      const hasEvalSwing = (evaluation.centipawnLoss || 0) >= MISSED_TACTIC_MIN_SWING;

      if (!hasTacticalTheme && !hasSignificantGain && !hasEvalSwing) continue;
      if (isTrivialRecapture(evaluation.fen, bestMove)) continue;
      if (isObviousCapture(evaluation.fen, bestMove) && !hasTacticalTheme) continue;

      const themeId = themeResult.theme ? convertLegacyTheme(themeResult.theme) : undefined;
      if (!shouldIncludePuzzle(themeId, materialGain, false)) continue;

      missedTactics.push(this._createPuzzleRecord(evaluation, {
        cpLoss: evaluation.centipawnLoss || 0,
        markerType: 'miss',
        moveNumber,
        playerColor,
        openingName,
        gameRating,
        themeId,
        materialGain,
        isPositive: false,
        isMissedTactic: true,
      }));
    }

    return missedTactics;
  }

  /**
   * Extract positive puzzles (brilliant moves)
   */
  extractPositivePuzzles(
    evaluations: Map<string, MoveEvaluation>,
    playerColor: 'white' | 'black',
    openingName?: string,
    gameRating?: number
  ): PersonalMistakeRecord[] {
    const positivePuzzles: PersonalMistakeRecord[] = [];

    for (const evaluation of evaluations.values()) {
      const markerTypeLower = String(evaluation.markerType || '').toLowerCase();
      if (markerTypeLower !== 'brilliant') continue;

      const { moveNumber, isPlayerMove } = extractMoveInfo(evaluation.fen, playerColor);
      if (!isPlayerMove || moveNumber < PUZZLE_MIN_MOVE_NUMBER) continue;
      if (positivePuzzles.length >= MAX_POSITIVE_PUZZLES_PER_GAME) continue;

      const evalBefore = evaluation.evaluationBefore || 0;
      const playerEval = getPlayerEval(evalBefore, playerColor);
      if (isPositionTooLost(playerEval)) continue;

      const playedMove = evaluation.move;
      const bestMove = evaluation.bestMove;
      const evalAfter = evaluation.evaluationAfter || 0;

      const themeResult = tacticalThemeService.detectTheme(evaluation.fen, playedMove, evalBefore, evalAfter);
      const themeId = themeResult?.theme ? convertLegacyTheme(themeResult.theme) : undefined;
      const materialGain = tacticalThemeService.calculateMaterialGain(evaluation.fen, playedMove);

      if (!shouldIncludePuzzle(themeId, materialGain, false)) continue;

      positivePuzzles.push(this._createPuzzleRecord(evaluation, {
        cpLoss: 0,
        markerType: markerTypeLower as 'brilliant',
        moveNumber,
        playerColor,
        openingName,
        gameRating,
        themeId,
        materialGain,
        isPositive: true,
        isMissedTactic: false,
        bestMoveOverride: bestMove || playedMove,
      }));
    }

    return positivePuzzles;
  }

  /**
   * Check if two moves are the same
   */
  private _areSameMoves(fen: string, playedMove: string, bestMove: string): boolean {
    if (playedMove === bestMove) return true;

    try {
      const chess = new Chess(fen);
      const moveResult = chess.move(playedMove);
      if (moveResult) {
        const playedUci = moveResult.from + moveResult.to + (moveResult.promotion || '');
        if (playedUci === bestMove || playedUci.slice(0, 4) === bestMove.slice(0, 4)) {
          return true;
        }
      }
    } catch {
      // Ignore conversion errors
    }
    return false;
  }

  /**
   * Create a puzzle record
   */
  private _createPuzzleRecord(
    evaluation: MoveEvaluation,
    options: {
      cpLoss: number;
      markerType: string;
      moveNumber: number;
      playerColor: 'white' | 'black';
      openingName?: string;
      gameRating?: number;
      themeId?: string;
      materialGain: number;
      isPositive: boolean;
      isMissedTactic: boolean;
      bestMoveOverride?: string;
    }
  ): PersonalMistakeRecord {
    return {
      fen: evaluation.fen,
      played_move: evaluation.move,
      best_move: options.bestMoveOverride || evaluation.bestMove,
      evaluation_loss: options.cpLoss,
      marker_type: options.markerType as any,
      move_number: options.moveNumber,
      player_color: options.playerColor,
      opening_name: options.openingName,
      game_rating: options.gameRating,
      puzzle_rating: options.gameRating ? options.gameRating + PUZZLE_RATING_BONUS : undefined,
      is_positive_puzzle: options.isPositive,
      is_missed_tactic: options.isMissedTactic,
      tactical_theme: options.themeId,
      material_gain: options.materialGain,
    };
  }
}

export const puzzleExtractionService = new PuzzleExtractionService();
