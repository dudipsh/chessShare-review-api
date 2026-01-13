/**
 * TacticalThemeService
 * Detects tactical themes/motifs in chess positions
 *
 * Tactical Themes:
 * - fork: Double attack on multiple pieces
 * - pin: Piece cannot move without exposing more valuable piece
 * - skewer: Like a pin but the more valuable piece is in front
 * - discovery: Moving a piece reveals an attack from another
 * - back_rank: Mate threat or execution on the back rank
 * - deflection: Forcing a piece away from defending
 * - trapped_piece: Winning a piece that has no escape
 * - winning_material: General material-winning tactic
 * - mate_threat: Creating or executing checkmate
 */

import { Chess, type Square, type PieceSymbol, type Color } from 'chess.js';
import type { TacticalTheme, TacticalThemeResult } from '../types/puzzle.types.js';
import { PIECE_VALUES } from '../config/puzzleConstants.js';

export class TacticalThemeService {
  /**
   * Detect the primary tactical theme of a puzzle
   * @param fen Position before the best move
   * @param bestMove The best move in UCI format (e.g., "e2e4")
   * @param evalBefore Evaluation before the move
   * @param evalAfter Evaluation after the move
   * @returns Tactical theme detection result
   */
  detectTheme(
    fen: string,
    bestMove: string,
    evalBefore?: number,
    evalAfter?: number
  ): TacticalThemeResult {
    try {
      const chess = new Chess(fen);
      const from = bestMove.slice(0, 2) as Square;
      const to = bestMove.slice(2, 4) as Square;
      const promotion = bestMove.length > 4 ? bestMove[4] as 'q' | 'r' | 'b' | 'n' : undefined;

      const movingPiece = chess.get(from);
      if (!movingPiece) {
        return { theme: null, confidence: 0, description: 'Invalid position' };
      }

      const playerColor = movingPiece.color;
      const opponentColor: Color = playerColor === 'w' ? 'b' : 'w';

      // Apply the move to get the position after
      const moveResult = chess.move({ from, to, promotion });
      if (!moveResult) {
        return { theme: null, confidence: 0, description: 'Invalid move' };
      }

      const fenAfter = chess.fen();

      // Check themes in order of priority/specificity

      // 1. Check for back rank mate threats
      const backRankResult = this._checkBackRankMate(fen, fenAfter, moveResult, playerColor);
      if (backRankResult.theme) return backRankResult;

      // 2. Check for discovered attack
      const discoveryResult = this._checkDiscoveredAttack(fen, fenAfter, movingPiece, from, to, playerColor);
      if (discoveryResult.theme) return discoveryResult;

      // 3. Check for fork
      const forkResult = this._checkFork(fenAfter, to, movingPiece, opponentColor);
      if (forkResult.theme) return forkResult;

      // 4. Check for pin/skewer
      const pinResult = this._checkPinOrSkewer(fenAfter, to, movingPiece, opponentColor);
      if (pinResult.theme) return pinResult;

      // 5. Check for trapped piece
      const trappedResult = this._checkTrappedPiece(fen, fenAfter, moveResult, opponentColor);
      if (trappedResult.theme) return trappedResult;

      // 6. Check for zwischenzug (in-between move)
      const zwischenzugResult = this._checkZwischenzug(fen, moveResult);
      if (zwischenzugResult.theme) return zwischenzugResult;

      // 7. Check for general material gain
      const materialResult = this._checkMaterialGain(moveResult, evalBefore, evalAfter);
      if (materialResult.theme) return materialResult;

      // 8. Check for mate threat
      const mateResult = this._checkMateThreat(fenAfter, evalAfter);
      if (mateResult.theme) return mateResult;

      // No specific theme detected
      return {
        theme: 'winning_material',
        confidence: 30,
        description: 'Strong tactical move'
      };

    } catch (error) {
      console.error('Error detecting tactical theme:', error);
      return { theme: null, confidence: 0, description: 'Error analyzing position' };
    }
  }

  /**
   * Check for back rank mate or threat
   */
  private _checkBackRankMate(
    fenBefore: string,
    fenAfter: string,
    move: ReturnType<Chess['move']>,
    playerColor: Color
  ): TacticalThemeResult {
    if (!move) return { theme: null, confidence: 0, description: '' };

    const chess = new Chess(fenAfter);

    // Check if move delivers checkmate
    if (chess.isCheckmate()) {
      const kingSquare = this._findKing(chess, playerColor === 'w' ? 'b' : 'w');
      if (kingSquare) {
        const kingRank = kingSquare[1];
        const backRank = playerColor === 'w' ? '8' : '1';
        if (kingRank === backRank) {
          return {
            theme: 'back_rank',
            confidence: 100,
            description: 'Back rank checkmate',
          };
        }
      }
    }

    // Check if move is a check on the back rank
    if (move.san.includes('+')) {
      const opponentKingSquare = this._findKing(chess, playerColor === 'w' ? 'b' : 'w');
      if (opponentKingSquare) {
        const kingRank = opponentKingSquare[1];
        const backRank = playerColor === 'w' ? '8' : '1';
        if (kingRank === backRank) {
          return {
            theme: 'back_rank',
            confidence: 85,
            description: 'Back rank attack',
          };
        }
      }
    }

    // Check if a rook or queen move targets the back rank
    if (move.piece === 'r' || move.piece === 'q') {
      const toRank = move.to[1];
      const backRank = playerColor === 'w' ? '8' : '1';
      if (toRank === backRank) {
        return {
          theme: 'back_rank',
          confidence: 60,
          description: 'Back rank pressure',
        };
      }
    }

    return { theme: null, confidence: 0, description: '' };
  }

  /**
   * Check for discovered attack
   */
  private _checkDiscoveredAttack(
    fenBefore: string,
    fenAfter: string,
    movingPiece: { type: PieceSymbol; color: Color },
    from: Square,
    to: Square,
    playerColor: Color
  ): TacticalThemeResult {
    try {
      const chessBefore = new Chess(fenBefore);
      const chessAfter = new Chess(fenAfter);

      // Get attacks before moving
      const attacksBefore = this._getAttackedSquares(chessBefore, playerColor);

      // Temporarily remove the piece to see what's behind it
      chessBefore.remove(from);
      const attacksWithPieceRemoved = this._getAttackedSquares(chessBefore, playerColor);

      // Find new attacks that appear when the piece moves (discovery)
      const newAttacks = attacksWithPieceRemoved.filter(sq => !attacksBefore.includes(sq));

      if (newAttacks.length > 0) {
        // Check if any new attack targets valuable pieces
        for (const square of newAttacks) {
          const targetPiece = chessAfter.get(square as Square);
          if (targetPiece && targetPiece.color !== playerColor) {
            const targetValue = PIECE_VALUES[targetPiece.type];
            if (targetValue >= PIECE_VALUES.r || targetPiece.type === 'k') {
              // Discovered attack on rook, queen, or king
              const isCheck = targetPiece.type === 'k';
              return {
                theme: 'discovery',
                confidence: isCheck ? 95 : 80,
                description: isCheck ? 'Discovered check' : 'Discovered attack',
              };
            }
          }
        }
      }

      return { theme: null, confidence: 0, description: '' };
    } catch {
      return { theme: null, confidence: 0, description: '' };
    }
  }

  /**
   * Check for fork (double attack)
   */
  private _checkFork(
    fenAfter: string,
    toSquare: Square,
    movingPiece: { type: PieceSymbol; color: Color },
    opponentColor: Color
  ): TacticalThemeResult {
    try {
      const chess = new Chess(fenAfter);

      // Get all squares attacked by the moved piece
      const attacks = chess.moves({ square: toSquare, verbose: true });

      // Find valuable pieces being attacked
      const attackedPieces: { square: Square; piece: PieceSymbol; value: number }[] = [];

      for (const attack of attacks) {
        if (attack.captured) {
          const value = PIECE_VALUES[attack.captured as PieceSymbol] || 0;
          attackedPieces.push({
            square: attack.to as Square,
            piece: attack.captured as PieceSymbol,
            value,
          });
        }
      }

      // Also check if attacking the king (check)
      if (chess.inCheck()) {
        const kingSquare = this._findKing(chess, opponentColor);
        if (kingSquare) {
          attackedPieces.push({
            square: kingSquare,
            piece: 'k',
            value: 10000, // King has infinite value
          });
        }
      }

      // Fork requires attacking 2+ pieces
      if (attackedPieces.length >= 2) {
        const totalValue = attackedPieces.reduce((sum, p) => sum + p.value, 0);
        const hasKingAttack = attackedPieces.some(p => p.piece === 'k');

        // Knight forks are classic
        if (movingPiece.type === 'n') {
          return {
            theme: 'fork',
            confidence: hasKingAttack ? 95 : 85,
            description: hasKingAttack ? 'Knight fork with check' : 'Knight fork',
          };
        }

        // Other piece forks
        if (totalValue >= PIECE_VALUES.r + PIECE_VALUES.n) {
          return {
            theme: 'fork',
            confidence: hasKingAttack ? 90 : 75,
            description: hasKingAttack ? 'Fork with check' : 'Double attack',
          };
        }
      }

      return { theme: null, confidence: 0, description: '' };
    } catch {
      return { theme: null, confidence: 0, description: '' };
    }
  }

  /**
   * Check for pin or skewer
   */
  private _checkPinOrSkewer(
    fenAfter: string,
    toSquare: Square,
    movingPiece: { type: PieceSymbol; color: Color },
    opponentColor: Color
  ): TacticalThemeResult {
    // Only bishops, rooks, queens can create pins/skewers
    if (!['b', 'r', 'q'].includes(movingPiece.type)) {
      return { theme: null, confidence: 0, description: '' };
    }

    try {
      const chess = new Chess(fenAfter);
      const playerColor = movingPiece.color;

      // Get direction vectors for the piece
      const directions = this._getPieceDirections(movingPiece.type);

      for (const direction of directions) {
        const piecesInLine: { square: Square; piece: { type: PieceSymbol; color: Color } }[] = [];
        let currentSquare = toSquare;

        // Walk along the direction
        for (let i = 0; i < 7; i++) {
          const nextFile = String.fromCharCode(currentSquare.charCodeAt(0) + direction[0]);
          const nextRank = String.fromCharCode(currentSquare.charCodeAt(1) + direction[1]);
          const nextSquare = `${nextFile}${nextRank}` as Square;

          // Check if square is valid
          if (nextFile < 'a' || nextFile > 'h' || nextRank < '1' || nextRank > '8') {
            break;
          }

          const piece = chess.get(nextSquare);
          if (piece) {
            if (piece.color === opponentColor) {
              piecesInLine.push({ square: nextSquare, piece });
            } else {
              // Hit own piece, stop
              break;
            }
          }

          currentSquare = nextSquare;
        }

        // Check for pin/skewer: need 2 pieces in line
        if (piecesInLine.length >= 2) {
          const firstPiece = piecesInLine[0];
          const secondPiece = piecesInLine[1];

          const firstValue = PIECE_VALUES[firstPiece.piece.type];
          const secondValue = secondPiece.piece.type === 'k' ? 10000 : PIECE_VALUES[secondPiece.piece.type];

          if (firstValue < secondValue) {
            // Pin: less valuable piece in front of more valuable
            const isAbsolutePin = secondPiece.piece.type === 'k';
            return {
              theme: 'pin',
              confidence: isAbsolutePin ? 95 : 80,
              description: isAbsolutePin ? 'Absolute pin to king' : 'Pin',
            };
          } else if (firstValue > secondValue && firstPiece.piece.type !== 'k') {
            // Skewer: more valuable piece in front
            return {
              theme: 'skewer',
              confidence: 85,
              description: 'Skewer',
            };
          }
        }
      }

      return { theme: null, confidence: 0, description: '' };
    } catch {
      return { theme: null, confidence: 0, description: '' };
    }
  }

  /**
   * Check for trapped piece
   */
  private _checkTrappedPiece(
    fenBefore: string,
    fenAfter: string,
    move: ReturnType<Chess['move']>,
    opponentColor: Color
  ): TacticalThemeResult {
    if (!move || !move.captured) {
      return { theme: null, confidence: 0, description: '' };
    }

    // The move captured a piece - check if it was trapped
    const capturedValue = PIECE_VALUES[move.captured as PieceSymbol] || 0;

    // If we captured a valuable piece (bishop+), it might have been trapped
    if (capturedValue >= PIECE_VALUES.b) {
      return {
        theme: 'trapped_piece',
        confidence: 60,
        description: `Captured trapped ${this._getPieceName(move.captured as PieceSymbol)}`,
      };
    }

    return { theme: null, confidence: 0, description: '' };
  }

  /**
   * Check for zwischenzug (intermediate move)
   */
  private _checkZwischenzug(
    fen: string,
    move: ReturnType<Chess['move']>
  ): TacticalThemeResult {
    if (!move) return { theme: null, confidence: 0, description: '' };

    // Zwischenzug is typically a check or capture that interrupts expected sequence
    if (move.san.includes('+') && move.captured) {
      // Capture with check is often an in-between move
      return {
        theme: 'zwischenzug',
        confidence: 50,
        description: 'In-between move',
      };
    }

    return { theme: null, confidence: 0, description: '' };
  }

  /**
   * Check for material gain
   */
  private _checkMaterialGain(
    move: ReturnType<Chess['move']>,
    evalBefore?: number,
    evalAfter?: number
  ): TacticalThemeResult {
    if (!move) return { theme: null, confidence: 0, description: '' };

    // Check if move captures material
    if (move.captured) {
      const capturedValue = PIECE_VALUES[move.captured as PieceSymbol] || 0;

      if (capturedValue >= PIECE_VALUES.q) {
        return {
          theme: 'winning_material',
          confidence: 90,
          description: 'Wins the queen',
        };
      }
      if (capturedValue >= PIECE_VALUES.r) {
        return {
          theme: 'winning_material',
          confidence: 85,
          description: 'Wins the rook',
        };
      }
      if (capturedValue >= PIECE_VALUES.b) {
        return {
          theme: 'winning_material',
          confidence: 75,
          description: 'Wins a minor piece',
        };
      }
    }

    // Check evaluation swing
    if (evalBefore !== undefined && evalAfter !== undefined) {
      const swing = evalAfter - evalBefore;
      if (swing >= 300) {
        return {
          theme: 'winning_material',
          confidence: 70,
          description: 'Wins significant material',
        };
      }
    }

    return { theme: null, confidence: 0, description: '' };
  }

  /**
   * Check for mate threat
   */
  private _checkMateThreat(fenAfter: string, evalAfter?: number): TacticalThemeResult {
    try {
      const chess = new Chess(fenAfter);

      if (chess.isCheckmate()) {
        return {
          theme: 'mate_threat',
          confidence: 100,
          description: 'Checkmate!',
        };
      }

      // Check for mate-in-X based on evaluation
      if (evalAfter !== undefined && Math.abs(evalAfter) > 10000) {
        const movesToMate = Math.ceil((32000 - Math.abs(evalAfter)) / 1000);
        return {
          theme: 'mate_threat',
          confidence: 95,
          description: `Forced mate in ${movesToMate}`,
        };
      }

      return { theme: null, confidence: 0, description: '' };
    } catch {
      return { theme: null, confidence: 0, description: '' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Helper methods
  // ═══════════════════════════════════════════════════════════════════════

  private _findKing(chess: Chess, color: Color): Square | null {
    const board = chess.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'k' && piece.color === color) {
          const fileChar = String.fromCharCode('a'.charCodeAt(0) + file);
          const rankChar = String(8 - rank);
          return `${fileChar}${rankChar}` as Square;
        }
      }
    }
    return null;
  }

  private _getAttackedSquares(chess: Chess, color: Color): string[] {
    const attacked: string[] = [];
    const board = chess.board();

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.color === color) {
          const square = `${String.fromCharCode('a'.charCodeAt(0) + file)}${8 - rank}` as Square;
          const moves = chess.moves({ square, verbose: true });
          for (const move of moves) {
            if (!attacked.includes(move.to)) {
              attacked.push(move.to);
            }
          }
        }
      }
    }

    return attacked;
  }

  private _getPieceDirections(pieceType: PieceSymbol): [number, number][] {
    switch (pieceType) {
      case 'b':
        return [[1, 1], [1, -1], [-1, 1], [-1, -1]]; // Diagonals
      case 'r':
        return [[1, 0], [-1, 0], [0, 1], [0, -1]]; // Ranks and files
      case 'q':
        return [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]; // All
      default:
        return [];
    }
  }

  private _getPieceName(piece: PieceSymbol): string {
    const names: Record<PieceSymbol, string> = {
      p: 'pawn',
      n: 'knight',
      b: 'bishop',
      r: 'rook',
      q: 'queen',
      k: 'king',
    };
    return names[piece] || piece;
  }

  /**
   * Calculate material gain from a move
   * @returns Centipawns gained (positive = good for player)
   */
  calculateMaterialGain(
    fen: string,
    bestMove: string,
    evalBefore?: number,
    evalAfter?: number
  ): number {
    try {
      const chess = new Chess(fen);
      const from = bestMove.slice(0, 2) as Square;
      const to = bestMove.slice(2, 4) as Square;
      const promotion = bestMove.length > 4 ? bestMove[4] as 'q' | 'r' | 'b' | 'n' : undefined;

      const movingPiece = chess.get(from);
      if (!movingPiece) return 0;

      const moveResult = chess.move({ from, to, promotion });
      if (!moveResult) return 0;

      // Direct material gain from capture
      let materialGain = 0;
      if (moveResult.captured) {
        materialGain = PIECE_VALUES[moveResult.captured as PieceSymbol] || 0;
      }

      // If we have evaluations, use the evaluation swing
      if (evalBefore !== undefined && evalAfter !== undefined) {
        const evalSwing = evalAfter - evalBefore;
        // Use the larger of direct material or eval swing
        return Math.max(materialGain, evalSwing);
      }

      return materialGain;
    } catch {
      return 0;
    }
  }
}

// Export singleton instance
export const tacticalThemeService = new TacticalThemeService();
