/**
 * PGN Parser Service - Parses PGN strings into move lists
 */

import { Chess } from 'chess.js';
import { ExtendedChessMove } from '../types/index.js';

export interface ParsedGame {
  moves: ExtendedChessMove[];
  headers: Record<string, string>;
  initialFen: string;
  fens: string[]; // FEN after each move
}

export interface ParsedPosition {
  fen: string;
  move: ExtendedChessMove;
  moveNumber: number;
  isWhiteMove: boolean;
}

export class PgnParserService {
  /**
   * Parse a PGN string into a structured game object
   */
  parsePgn(pgn: string): ParsedGame {
    const chess = new Chess();

    // Try to load the PGN
    try {
      chess.loadPgn(pgn);
    } catch (error) {
      throw new Error(`Invalid PGN: ${error instanceof Error ? error.message : 'Parse error'}`);
    }

    // Extract headers
    const headers = this.extractHeaders(pgn);

    // Get initial FEN (standard start position or from headers)
    const initialFen = headers['FEN'] || chess.fen();

    // Reset and replay to get all positions
    const history = chess.history({ verbose: true });
    chess.reset();

    if (headers['FEN']) {
      chess.load(headers['FEN']);
    }

    const moves: ExtendedChessMove[] = [];
    const fens: string[] = [chess.fen()]; // Starting position

    for (const move of history) {
      // Convert to ExtendedChessMove
      const extendedMove: ExtendedChessMove = {
        from: move.from,
        to: move.to,
        piece: move.piece,
        captured: move.captured,
        promotion: move.promotion,
        san: move.san,
        flags: move.flags,
        nags: [], // NAGs would need separate parsing
      };

      moves.push(extendedMove);

      // Make the move and store resulting FEN
      chess.move(move);
      fens.push(chess.fen());
    }

    return {
      moves,
      headers,
      initialFen: fens[0],
      fens,
    };
  }

  /**
   * Get positions for analysis (FEN before each move)
   */
  getPositionsForAnalysis(parsedGame: ParsedGame): ParsedPosition[] {
    const positions: ParsedPosition[] = [];

    for (let i = 0; i < parsedGame.moves.length; i++) {
      const move = parsedGame.moves[i];
      const fen = parsedGame.fens[i]; // FEN before the move
      const moveNumber = Math.floor(i / 2) + 1;
      const isWhiteMove = i % 2 === 0;

      positions.push({
        fen,
        move,
        moveNumber,
        isWhiteMove,
      });
    }

    return positions;
  }

  /**
   * Extract PGN headers
   */
  private extractHeaders(pgn: string): Record<string, string> {
    const headers: Record<string, string> = {};
    const headerRegex = /\[(\w+)\s+"([^"]+)"\]/g;

    let match: RegExpExecArray | null;
    while ((match = headerRegex.exec(pgn)) !== null) {
      headers[match[1]] = match[2];
    }

    return headers;
  }

  /**
   * Determine game result from PGN
   */
  getGameResult(
    headers: Record<string, string>
  ): 'white' | 'black' | 'draw' | null {
    const result = headers['Result'];

    if (!result) return null;

    if (result === '1-0') return 'white';
    if (result === '0-1') return 'black';
    if (result === '1/2-1/2') return 'draw';

    return null;
  }

  /**
   * Get player color from headers
   */
  getPlayerColor(
    headers: Record<string, string>,
    username?: string
  ): 'white' | 'black' | null {
    if (!username) return null;

    const whitePlayer = headers['White']?.toLowerCase();
    const blackPlayer = headers['Black']?.toLowerCase();
    const userLower = username.toLowerCase();

    if (whitePlayer === userLower) return 'white';
    if (blackPlayer === userLower) return 'black';

    return null;
  }
}

// Singleton instance
export const pgnParserService = new PgnParserService();
