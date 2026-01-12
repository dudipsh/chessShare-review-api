/**
 * BookMoveClassifier - Detects opening book moves
 * Uses ECO database for fast, offline detection
 */

import { Chess } from 'chess.js';

export interface OpeningInfo {
  eco: string;
  name: string;
}

export interface BookMoveInput {
  fen: string;
  moveUci: string;
  moveSan?: string;
  moveNumber: number;
}

export interface BookMoveResult {
  isBook: boolean;
  opening: OpeningInfo | null;
}

// Maximum move number to check for book moves
const MAX_BOOK_MOVES = 25;

interface OpeningLine {
  eco: string;
  name: string;
  moves: string;
}

/**
 * Common opening lines database
 */
const OPENING_LINES: OpeningLine[] = [
  // King's Pawn
  { eco: 'B00', name: "King's Pawn Opening", moves: 'e4' },
  { eco: 'C20', name: "King's Pawn Game", moves: 'e4 e5' },

  // Sicilian Defense
  { eco: 'B20', name: 'Sicilian Defense', moves: 'e4 c5' },
  { eco: 'B21', name: 'Sicilian Defense: Smith-Morra Gambit', moves: 'e4 c5 d4 cxd4 c3' },
  { eco: 'B22', name: 'Sicilian Defense: Alapin Variation', moves: 'e4 c5 c3' },
  { eco: 'B30', name: 'Sicilian Defense: Rossolimo', moves: 'e4 c5 Nf3 Nc6 Bb5' },
  { eco: 'B50', name: 'Sicilian Defense: Open', moves: 'e4 c5 Nf3 d6 d4' },
  { eco: 'B90', name: 'Sicilian Defense: Najdorf', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6' },

  // French Defense
  { eco: 'C00', name: 'French Defense', moves: 'e4 e6' },
  { eco: 'C02', name: 'French Defense: Advance', moves: 'e4 e6 d4 d5 e5' },
  { eco: 'C11', name: 'French Defense: Classical', moves: 'e4 e6 d4 d5 Nc3 Nf6' },

  // Caro-Kann
  { eco: 'B10', name: 'Caro-Kann Defense', moves: 'e4 c6' },
  { eco: 'B12', name: 'Caro-Kann: Advance', moves: 'e4 c6 d4 d5 e5' },
  { eco: 'B18', name: 'Caro-Kann: Classical', moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5' },

  // Italian/Ruy Lopez
  { eco: 'C50', name: 'Italian Game', moves: 'e4 e5 Nf3 Nc6 Bc4' },
  { eco: 'C54', name: 'Italian Game: Giuoco Piano', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3' },
  { eco: 'C60', name: 'Ruy Lopez', moves: 'e4 e5 Nf3 Nc6 Bb5' },
  { eco: 'C65', name: 'Ruy Lopez: Berlin', moves: 'e4 e5 Nf3 Nc6 Bb5 Nf6' },
  { eco: 'C78', name: 'Ruy Lopez: Morphy', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O' },

  // Queen's Pawn
  { eco: 'D00', name: "Queen's Pawn Opening", moves: 'd4' },
  { eco: 'D02', name: 'London System', moves: 'd4 d5 Nf3 Nf6 Bf4' },
  { eco: 'A45', name: 'London System', moves: 'd4 Nf6 Bf4' },
  { eco: 'D00', name: 'Jobava London', moves: 'd4 d5 Nc3' },
  { eco: 'D00', name: 'Jobava London', moves: 'd4 d5 Nc3 Nf6 Bf4' },
  { eco: 'A45', name: 'Jobava London', moves: 'd4 Nf6 Nc3 d5 Bf4' },

  // Indian Defenses
  { eco: 'A45', name: 'Indian Game', moves: 'd4 Nf6' },
  { eco: 'E60', name: "King's Indian Defense", moves: 'd4 Nf6 c4 g6' },
  { eco: 'E70', name: "King's Indian: Classical", moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3' },
  { eco: 'E20', name: 'Nimzo-Indian Defense', moves: 'd4 Nf6 c4 e6 Nc3 Bb4' },
  { eco: 'E12', name: "Queen's Indian Defense", moves: 'd4 Nf6 c4 e6 Nf3 b6' },
  { eco: 'D70', name: 'Grünfeld Defense', moves: 'd4 Nf6 c4 g6 Nc3 d5' },

  // Queen's Gambit
  { eco: 'D06', name: "Queen's Gambit", moves: 'd4 d5 c4' },
  { eco: 'D10', name: 'Slav Defense', moves: 'd4 d5 c4 c6' },
  { eco: 'D20', name: "Queen's Gambit Accepted", moves: 'd4 d5 c4 dxc4' },
  { eco: 'D30', name: "Queen's Gambit Declined", moves: 'd4 d5 c4 e6' },

  // English & Réti
  { eco: 'A10', name: 'English Opening', moves: 'c4' },
  { eco: 'A04', name: 'Réti Opening', moves: 'Nf3' },
  { eco: 'A09', name: 'Réti Opening', moves: 'Nf3 d5 c4' },

  // Catalan
  { eco: 'E00', name: 'Catalan Opening', moves: 'd4 Nf6 c4 e6 g3' },

  // Scotch
  { eco: 'C44', name: 'Scotch Game', moves: 'e4 e5 Nf3 Nc6 d4' },

  // Petrov
  { eco: 'C42', name: 'Petrov Defense', moves: 'e4 e5 Nf3 Nf6' },

  // Pirc/Modern
  { eco: 'B06', name: 'Modern Defense', moves: 'e4 g6' },
  { eco: 'B07', name: 'Pirc Defense', moves: 'e4 d6 d4 Nf6' },

  // Scandinavian
  { eco: 'B01', name: 'Scandinavian Defense', moves: 'e4 d5' },
];

// Build lookup maps
const FEN_TO_OPENING: Map<string, OpeningInfo> = new Map();

function initializeMaps(): void {
  for (const line of OPENING_LINES) {
    try {
      const chess = new Chess();
      const moves = line.moves.split(' ');
      for (const move of moves) {
        chess.move(move);
      }
      const fen = chess.fen();
      const positionKey = fen.split(' ').slice(0, 4).join(' ');
      FEN_TO_OPENING.set(positionKey, { eco: line.eco, name: line.name });
    } catch {
      // Skip invalid lines
    }
  }
}

initializeMaps();

export class BookMoveClassifier {
  /**
   * Check if a move is a known book/theoretical move
   */
  isBookMove(input: BookMoveInput): BookMoveResult {
    const { fen, moveUci, moveSan, moveNumber } = input;

    // After opening phase, don't check
    if (moveNumber > MAX_BOOK_MOVES) {
      return { isBook: false, opening: null };
    }

    try {
      const chess = new Chess(fen);

      // Make the move
      const move = chess.move(
        moveUci.length === 4 || moveUci.length === 5
          ? { from: moveUci.slice(0, 2), to: moveUci.slice(2, 4), promotion: moveUci[4] }
          : moveSan || moveUci
      );

      if (!move) {
        return { isBook: false, opening: null };
      }

      // Check resulting position
      const resultingFen = chess.fen();
      const positionKey = resultingFen.split(' ').slice(0, 4).join(' ');
      const opening = FEN_TO_OPENING.get(positionKey);

      if (opening) {
        return { isBook: true, opening };
      }

      // Check if position before was a known opening
      const beforeKey = fen.split(' ').slice(0, 4).join(' ');
      const openingBefore = FEN_TO_OPENING.get(beforeKey);

      if (openingBefore) {
        return { isBook: true, opening: openingBefore };
      }

      return { isBook: false, opening: null };
    } catch {
      return { isBook: false, opening: null };
    }
  }

  /**
   * Get opening info for a position
   */
  getOpeningForPosition(fen: string): OpeningInfo | null {
    const positionKey = fen.split(' ').slice(0, 4).join(' ');
    return FEN_TO_OPENING.get(positionKey) || null;
  }

  /**
   * Get database size
   */
  get databaseSize(): number {
    return FEN_TO_OPENING.size;
  }
}

// Singleton instance
export const bookMoveClassifier = new BookMoveClassifier();
