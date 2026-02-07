/**
 * Type definitions for game review
 */

/**
 * Chess.com marker types + Book move
 */
export enum MarkerType {
  BOOK = 'book',
  BRILLIANT = 'brilliant',
  GREAT = 'great',
  BEST = 'best',
  GOOD = 'good',
  INACCURACY = 'inaccuracy',
  MISTAKE = 'mistake',
  MISS = 'miss',
  BLUNDER = 'blunder',
}

/**
 * Evaluation score - either centipawns or mate in N
 */
export type Score =
  | { type: 'cp'; value: number }
  | { type: 'mate'; value: number };

/**
 * Chess move from chess.js
 */
export interface ChessMove {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  san: string;
  flags: string;
}

/**
 * Extended move with annotations
 * NAGs can be strings ('$1') or numbers (1) depending on the parser
 */
export interface ExtendedChessMove extends ChessMove {
  nags?: (string | number)[];
}

/**
 * Stockfish analysis result
 */
export interface StockfishAnalysis {
  evaluation: number;
  bestMove: string;
  topMoves: Array<{ uci: string; cp: number }>;
  depth?: number; // Analysis depth used
}

/**
 * Stockfish analyzer interface
 */
export interface StockfishAnalyzer {
  analyzePosition: (
    fen: string,
    options?: { depth?: number; timeout?: number }
  ) => Promise<StockfishAnalysis>;
  stop?: () => void; // Optional: Stop ongoing analysis (if supported)
  onStart?: () => void | Promise<void>; // Optional: Called when game review starts (can be async)
  onComplete?: () => void; // Optional: Called when game review completes/fails
  stopAnalysis?: () => void; // Optional: Stop Stockfish analysis
  resetEngine?: () => Promise<void>; // Optional: Reset Stockfish engine state
  clearCache?: () => void; // Optional: Clear analysis cache for consistent results
}

/**
 * Move evaluation result
 */
export interface MoveEvaluation {
  readonly fen: string;
  readonly move: string;
  readonly evaluationBefore: number;
  readonly evaluationAfter: number;
  readonly bestMove: string;
  readonly markerType: MarkerType;
  readonly centipawnLoss: number;
  readonly isAnalyzed: boolean;
  readonly timestamp: number;
  readonly depth?: number; // Depth used for analysis (for logging)
}

/**
 * Game review state
 */
export interface GameReviewState {
  readonly isReviewing: boolean;
  readonly isCompleted: boolean;
  readonly progress: number;
  readonly totalMoves: number;
  readonly analyzedMoves: number;
  readonly currentAnalyzingMove: number;
  readonly error: string | null;
}

/**
 * Game review configuration
 */
export interface GameReviewConfig {
  readonly analysisDepth: number;
  readonly timeoutPerMove: number;
  readonly enableProgressCallback: boolean;
  readonly timeoutMultiplierPer40Moves: number;
}

// ═══════════════════════════════════════════════════════════════════════
// API Types
// ═══════════════════════════════════════════════════════════════════════

/**
 * Request to start a game review
 */
export interface ReviewRequest {
  pgn: string;
  playerColor: 'white' | 'black';
  gameId?: string;
  platform?: 'lichess' | 'chesscom';
  options?: {
    depth?: number;
    includeRawEvals?: boolean;
  };
}

/**
 * Progress event during analysis
 */
export interface ReviewProgressEvent {
  type: 'progress';
  currentMove: number;
  totalMoves: number;
  percentage: number;
}

/**
 * Move analyzed event
 */
export interface MoveAnalyzedEvent {
  type: 'move';
  moveNumber: number;
  fen: string;
  move: string;
  markerType: MarkerType;
  centipawnLoss: number;
  evaluationBefore: number;
  evaluationAfter: number;
  bestMove: string;
}

/**
 * Review completion event
 */
export interface ReviewCompleteEvent {
  type: 'complete';
  reviewId: string;
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
}

/**
 * Error event
 */
export interface ReviewErrorEvent {
  type: 'error';
  message: string;
  code?: string;
}

/**
 * All SSE event types
 */
export type ReviewEvent =
  | ReviewProgressEvent
  | MoveAnalyzedEvent
  | ReviewCompleteEvent
  | ReviewErrorEvent;

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  stockfish: 'ready' | 'initializing' | 'error';
  activeAnalyses: number;
  queueLength: number;
  uptime: number;
  version: string;
}

/**
 * User tier for rate limiting
 */
export type UserTier = 'free' | 'basic' | 'pro';

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  tier: UserTier;
  remaining: number;
  limit: number;
  resetAt: Date;
}
