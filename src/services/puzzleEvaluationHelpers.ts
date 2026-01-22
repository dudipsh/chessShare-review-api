/**
 * Puzzle Evaluation Helpers
 * Helper functions for validating moves and detecting trivial positions
 */

import { Chess, type Square } from 'chess.js';
import { PIECE_VALUES } from '../config/puzzleConstants.js';

/**
 * Check if a move is a trivial recapture
 */
export function isTrivialRecapture(fen: string, bestMove: string): boolean {
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
export function isObviousCapture(fen: string, bestMove: string): boolean {
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
export function isSameMove(fen: string, move1: string, move2: string): boolean {
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

/**
 * Extract move info from FEN
 */
export function extractMoveInfo(fen: string, playerColor: 'white' | 'black') {
  const fenParts = fen.split(' ');
  const isWhiteMove = fenParts[1] === 'w';
  const moveNumber = parseInt(fenParts[5], 10) || 1;
  const isPlayerMove =
    (playerColor === 'white' && isWhiteMove) ||
    (playerColor === 'black' && !isWhiteMove);

  return { isWhiteMove, moveNumber, isPlayerMove };
}

/**
 * Check if position is too lost to create a puzzle
 */
export function isPositionTooLost(playerEval: number): boolean {
  const isMateAgainstPlayer = playerEval < -90000;
  const isHeavilyLosing = playerEval < -500; // Losing by more than 5 pawns
  return isMateAgainstPlayer || isHeavilyLosing;
}

/**
 * Calculate player's evaluation from raw eval
 */
export function getPlayerEval(evalBefore: number, playerColor: 'white' | 'black'): number {
  return playerColor === 'white' ? evalBefore : -evalBefore;
}
