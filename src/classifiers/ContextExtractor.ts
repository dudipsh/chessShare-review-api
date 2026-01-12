/**
 * Extracts context information needed for move classification
 */

import { Chess } from 'chess.js';
import type {
  ExtendedChessMove,
  StockfishAnalysis,
} from '../types/index.js';

export interface MoveContext {
  evalBefore: number;
  evalAfter: number;
  bestMove: string;
  playedMoveUci: string;
  isWhiteMove: boolean;
  evalIfBestMove: number;
  moveNumber: number;
  isEvalIfBestUnreliable: boolean;
  isInTopMoves: boolean; // ✅ NEW: Track if move is in top moves
  fenBefore: string;
  fenAfter: string;
  playedMove: ExtendedChessMove;
}

export class ContextExtractor {
  /**
   * Extract all context needed for classification
   */
  extract(
    fenBefore: string,
    playedMove: ExtendedChessMove,
    analysisBefore: StockfishAnalysis,
    analysisAfter: StockfishAnalysis,
    moveNumber?: number
  ): MoveContext {
    const evalBefore = analysisBefore.evaluation;
    const bestMove = analysisBefore.bestMove;
    const playedMoveUci =
      playedMove.from + playedMove.to + (playedMove.promotion || '');
    const isWhiteMove = fenBefore.split(' ')[1] === 'w';

    const playedIsBest = playedMoveUci.toLowerCase() === bestMove.toLowerCase();

    // ✅ FIXED: Always use actual analysis evaluation for accurate loss calculation
    // This ensures moves that drop eval significantly (like h6: +0.7 → +0.1) are penalized
    const evalAfter = analysisAfter.evaluation;

    // ✅ FIXED: Always try to get the best move evaluation
    let evalIfBestMove = evalAfter; // Default fallback
    
    if (analysisBefore.topMoves?.length) {
      // Find the BEST move's evaluation from topMoves
      const bestMoveData = analysisBefore.topMoves.find(
        (m) => m.uci.toLowerCase() === bestMove.toLowerCase()
      );

      if (bestMoveData) {
        evalIfBestMove = bestMoveData.cp;
      } else if (analysisBefore.topMoves[0]) {
        // Fallback: use first move in topMoves (should be best)
        evalIfBestMove = analysisBefore.topMoves[0].cp;
      }
    }
    
    const playedInTop3 = analysisBefore.topMoves?.some(m => m.uci.toLowerCase() === playedMoveUci.toLowerCase());
    
    // ⚠️ CRITICAL: If move not in top3 but evalAfter > evalIfBestMove, something is wrong
    if (!playedInTop3 && isWhiteMove && evalAfter > evalIfBestMove) {
    } else if (!playedInTop3 && !isWhiteMove && evalAfter < evalIfBestMove) {
    }

    // Check if evalIfBestMove is unreliable
    // ✅ FIXED: Also check if played move is not in topMoves
    const playedMoveInTopMoves = analysisBefore.topMoves?.some(
      (m) => m.uci.toLowerCase() === playedMoveUci.toLowerCase()
    );
    
    const isEvalIfBestUnreliable =
      !playedIsBest &&
      (!playedMoveInTopMoves || 
       evalIfBestMove === evalAfter || 
       evalIfBestMove === evalBefore);
       

    // Calculate fenAfter by applying the move
    let fenAfter = fenBefore;
    try {
      const chess = new Chess(fenBefore);
      chess.move({
        from: playedMove.from,
        to: playedMove.to,
        promotion: playedMove.promotion,
      });
      fenAfter = chess.fen();
    } catch (e) {
      // If we can't calculate fenAfter, just use fenBefore (fallback)
    }

    
    return {
      evalBefore,
      evalAfter,
      bestMove,
      playedMoveUci,
      isWhiteMove,
      evalIfBestMove,
      moveNumber: moveNumber || 1,
      isEvalIfBestUnreliable,
      isInTopMoves: playedInTop3, // ✅ NEW: Pass the top moves status
      fenBefore,
      fenAfter,
      playedMove,
    };
  }

  /**
   * Get total material count from FEN
   */
  getMaterialCount(fen: string): number {
    if (!fen || fen === 'N/A') return -1;

    try {
      const pieces = fen.split(' ')[0];
      const queens = (pieces.match(/[Qq]/g) || []).length;
      const rooks = (pieces.match(/[Rr]/g) || []).length;
      const bishops = (pieces.match(/[Bb]/g) || []).length;
      const knights = (pieces.match(/[Nn]/g) || []).length;
      return queens * 9 + rooks * 5 + bishops * 3 + knights * 3;
    } catch (e) {
      return -1;
    }
  }

  /**
   * Check if position is a critical endgame (few pieces left)
   */
  isCriticalEndgame(fen: string): boolean {
    const totalMaterial = this.getMaterialCount(fen);
    if (totalMaterial < 0) return false;

    // Positions with ≤24 material require deep calculation
    return totalMaterial <= 24;
  }
}


