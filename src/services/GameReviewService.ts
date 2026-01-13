/**
 * Game Review Service - Orchestrates the full game review process
 */

import { Chess } from 'chess.js';
import { getStockfishPool } from '../engine/StockfishPool.js';
import { ClassificationService } from './ClassificationService.js';
import { PgnParserService, ParsedGame, ParsedPosition } from './PgnParserService.js';
import {
  MarkerType,
  MoveEvaluation,
  StockfishAnalysis,
} from '../types/index.js';
import {
  getProgressiveDepth,
  ANALYSIS_CONFIG,
  RETRY_CONFIG,
} from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { bookMoveClassifier } from '../classifiers/BookMoveClassifier.js';

/**
 * Normalize Stockfish evaluation to White's perspective
 * Stockfish returns evaluation from the side-to-move's perspective,
 * but we need it consistently from White's perspective for classification
 */
function normalizeEvalToWhite(evaluation: number, fen: string): number {
  const sideToMove = fen.split(' ')[1];
  // If it's Black's turn, negate the evaluation to get White's perspective
  return sideToMove === 'b' ? -evaluation : evaluation;
}

/**
 * Normalize all evaluations in a StockfishAnalysis result to White's perspective
 */
function normalizeAnalysisToWhite(analysis: StockfishAnalysis, fen: string): StockfishAnalysis {
  const sideToMove = fen.split(' ')[1];
  if (sideToMove === 'w') {
    // Already from White's perspective
    return analysis;
  }

  // Negate all evaluations
  return {
    ...analysis,
    evaluation: -analysis.evaluation,
    topMoves: analysis.topMoves?.map(move => ({
      ...move,
      cp: -move.cp,
    })),
  };
}

const reviewLogger = logger.child({ service: 'GameReview' });

export interface ReviewOptions {
  depth?: number;
  onProgress?: (current: number, total: number) => void;
  onMoveAnalyzed?: (moveData: MoveAnalyzedData) => void;
}

export interface MoveAnalyzedData {
  moveNumber: number;
  fen: string;
  move: string;
  markerType: MarkerType;
  centipawnLoss: number;
  evaluationBefore: number;
  evaluationAfter: number;
  bestMove: string;
}

export interface ReviewResult {
  accuracy: {
    white: number;
    black: number;
  };
  summary: {
    book: number;
    brilliant: number;
    great: number;
    best: number;
    good: number;
    inaccuracy: number;
    mistake: number;
    miss: number;
    blunder: number;
  };
  totalMoves: number;
  evaluations: Map<string, MoveEvaluation>;
}

export class GameReviewService {
  private readonly pgnParser: PgnParserService;
  private readonly classificationService: ClassificationService;

  constructor() {
    this.pgnParser = new PgnParserService();
    this.classificationService = new ClassificationService();
  }

  /**
   * Review a full game
   */
  async reviewGame(
    pgn: string,
    playerColor: 'white' | 'black',
    options: ReviewOptions = {}
  ): Promise<ReviewResult> {
    // Parse PGN
    const parsedGame = this.pgnParser.parsePgn(pgn);
    const positions = this.pgnParser.getPositionsForAnalysis(parsedGame);
    const gameResult = this.pgnParser.getGameResult(parsedGame.headers);

    reviewLogger.info(
      { totalMoves: positions.length, playerColor },
      'Starting game review'
    );

    // Reset classification service
    this.classificationService.reset();

    // Get Stockfish pool
    const pool = getStockfishPool();
    if (!pool.initialized) {
      throw new Error('Stockfish pool is not initialized');
    }

    // Analyze all positions
    const evaluations = new Map<string, MoveEvaluation>();
    const summary = this.createEmptySummary();
    let whiteAccuracySum = 0;
    let blackAccuracySum = 0;
    let whiteMoveCount = 0;
    let blackMoveCount = 0;

    for (let i = 0; i < positions.length; i++) {
      const position = positions[i];
      const nextPosition = positions[i + 1];

      // Calculate depth for this position
      const depth = options.depth || getProgressiveDepth(i);

      try {
        // Check for book move first (skip Stockfish if book)
        const moveUci = `${position.move.from}${position.move.to}${position.move.promotion || ''}`;
        const bookResult = bookMoveClassifier.isBookMove({
          fen: position.fen,
          moveUci,
          moveSan: position.move.san,
          moveNumber: position.moveNumber,
        });

        if (bookResult.isBook) {
          // Book move - skip analysis
          const evaluation: MoveEvaluation = {
            fen: position.fen,
            move: position.move.san,
            evaluationBefore: 0,
            evaluationAfter: 0,
            bestMove: moveUci,
            markerType: MarkerType.BOOK,
            centipawnLoss: 0,
            isAnalyzed: true,
            timestamp: Date.now(),
            depth: 0,
          };

          evaluations.set(position.fen, evaluation);
          summary.book++;

          // Book moves count as 100% accuracy
          if (position.isWhiteMove) {
            whiteAccuracySum += 100;
            whiteMoveCount++;
          } else {
            blackAccuracySum += 100;
            blackMoveCount++;
          }

          options.onProgress?.(i + 1, positions.length);
          options.onMoveAnalyzed?.({
            moveNumber: position.moveNumber,
            fen: position.fen,
            move: position.move.san,
            markerType: MarkerType.BOOK,
            centipawnLoss: 0,
            evaluationBefore: 0,
            evaluationAfter: 0,
            bestMove: moveUci,
          });
          continue;
        }

        // Analyze position before move
        const rawAnalysisBefore = await this.analyzeWithRetry(
          pool,
          position.fen,
          depth
        );
        // Normalize to White's perspective
        const analysisBefore = normalizeAnalysisToWhite(rawAnalysisBefore, position.fen);

        // Get FEN after move
        const fenAfter = parsedGame.fens[i + 1];

        // Analyze position after move
        const rawAnalysisAfter = await this.analyzeWithRetry(pool, fenAfter, depth);
        // Normalize to White's perspective
        const analysisAfter = normalizeAnalysisToWhite(rawAnalysisAfter, fenAfter);

        // Classify the move
        const classification = this.classificationService.classifyMove(
          position.fen,
          position.move,
          analysisBefore,
          analysisAfter,
          position.moveNumber,
          gameResult
        );

        // Create move evaluation
        const evaluation: MoveEvaluation = {
          fen: position.fen,
          move: position.move.san,
          evaluationBefore: analysisBefore.evaluation,
          evaluationAfter: analysisAfter.evaluation,
          bestMove: analysisBefore.bestMove,
          markerType: classification.markerType,
          centipawnLoss: classification.centipawnLoss,
          isAnalyzed: true,
          timestamp: Date.now(),
          depth,
        };

        evaluations.set(position.fen, evaluation);

        // Update summary
        summary[classification.markerType]++;

        // Update accuracy tracking
        const moveAccuracy = this.calculateMoveAccuracy(classification.centipawnLoss);
        if (position.isWhiteMove) {
          whiteAccuracySum += moveAccuracy;
          whiteMoveCount++;
        } else {
          blackAccuracySum += moveAccuracy;
          blackMoveCount++;
        }

        // Report progress
        options.onProgress?.(i + 1, positions.length);

        // Report move analyzed
        options.onMoveAnalyzed?.({
          moveNumber: position.moveNumber,
          fen: position.fen,
          move: position.move.san,
          markerType: classification.markerType,
          centipawnLoss: classification.centipawnLoss,
          evaluationBefore: analysisBefore.evaluation,
          evaluationAfter: analysisAfter.evaluation,
          bestMove: analysisBefore.bestMove,
        });
      } catch (error) {
        reviewLogger.error(
          { error, moveNumber: position.moveNumber, fen: position.fen },
          'Failed to analyze position'
        );
        throw error;
      }
    }

    // Calculate final accuracy
    const accuracy = {
      white: whiteMoveCount > 0 ? whiteAccuracySum / whiteMoveCount : 100,
      black: blackMoveCount > 0 ? blackAccuracySum / blackMoveCount : 100,
    };

    reviewLogger.info({ accuracy, summary }, 'Game review completed');

    return {
      accuracy,
      summary,
      totalMoves: positions.length,
      evaluations,
    };
  }

  /**
   * Analyze a single position
   * Handles game-over positions (checkmate/stalemate) gracefully
   */
  async analyzePosition(
    fen: string,
    options: { depth?: number } = {}
  ): Promise<StockfishAnalysis> {
    // Check for game-over positions (checkmate, stalemate, insufficient material)
    try {
      const chess = new Chess(fen);
      if (chess.isGameOver()) {
        // Return a synthetic result for game-over positions
        const isCheckmate = chess.isCheckmate();
        const sideToMove = fen.split(' ')[1];

        // In checkmate, the side to move loses (eval = -99999 for them)
        // From White's perspective: Black to move and checkmated = +99999, White checkmated = -99999
        const evaluation = isCheckmate
          ? (sideToMove === 'w' ? -99999 : 99999)
          : 0; // Stalemate/draw = 0

        return {
          evaluation,
          bestMove: '',
          depth: 0,
          topMoves: [],
        };
      }
    } catch (e) {
      // If FEN parsing fails, continue with normal analysis
    }

    const pool = getStockfishPool();
    if (!pool.initialized) {
      throw new Error('Stockfish pool is not initialized');
    }

    const depth = options.depth || ANALYSIS_CONFIG.STABLE_DEPTH;
    return this.analyzeWithRetry(pool, fen, depth);
  }

  /**
   * Analyze with retry logic
   */
  private async analyzeWithRetry(
    pool: ReturnType<typeof getStockfishPool>,
    fen: string,
    depth: number
  ): Promise<StockfishAnalysis> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
      try {
        const adjustedTimeout = ANALYSIS_CONFIG.TIMEOUT * attempt;
        const adjustedDepth = Math.max(
          RETRY_CONFIG.MIN_DEPTH,
          depth - (attempt - 1) * RETRY_CONFIG.DEPTH_REDUCTION_PER_RETRY
        );

        const result = await pool.analyzePosition(fen, {
          depth: adjustedDepth,
          timeout: adjustedTimeout,
        });

        if (result && result.topMoves && result.topMoves.length > 0) {
          return result;
        }

        throw new Error('Invalid analysis result');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < RETRY_CONFIG.MAX_RETRIES) {
          await this.delay(RETRY_CONFIG.BASE_WAIT_TIME * attempt);
        }
      }
    }

    throw lastError || new Error('Analysis failed after all retries');
  }

  /**
   * Calculate move accuracy using Chess.com-style formula
   * Based on ACPL (Average Centipawn Loss)
   */
  private calculateMoveAccuracy(centipawnLoss: number): number {
    // Cap the loss at 200cp for accuracy calculation
    const cappedLoss = Math.min(centipawnLoss, 200);

    // Chess.com style formula: accuracy = 100 * 0.995^(cappedLoss)
    // This gives ~100% for 0cp loss, ~85% for 100cp loss, ~72% for 200cp loss
    const accuracy = 100 * Math.pow(0.995, cappedLoss);

    return Math.max(0, Math.min(100, accuracy));
  }

  private createEmptySummary(): ReviewResult['summary'] {
    return {
      book: 0,
      brilliant: 0,
      great: 0,
      best: 0,
      good: 0,
      inaccuracy: 0,
      mistake: 0,
      miss: 0,
      blunder: 0,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const gameReviewService = new GameReviewService();
