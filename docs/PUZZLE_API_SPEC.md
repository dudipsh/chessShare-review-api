# Puzzle Generation API Specification

## Overview

Move puzzle extraction from client-side to server-side for:
- Faster puzzle generation (Stockfish runs on server)
- Higher quality puzzles with solution sequences
- Better tactical theme detection
- Consistent puzzle difficulty ratings

## API Endpoints

### POST /api/v1/puzzles/extract

Extract puzzles from a game review.

**Request:**
```json
{
  "reviewId": "uuid",
  "pgn": "1. e4 e5...",
  "playerColor": "white" | "black",
  "gameRating": 1500
}
```

**Response:**
```json
{
  "puzzles": [
    {
      "id": "uuid",
      "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      "solution": ["e7e5", "g1f3", "b8c6"],
      "rating": 1400,
      "themes": ["fork", "advantage"],
      "type": "mistake" | "missed_tactic" | "brilliant",
      "moveNumber": 10,
      "evaluationSwing": 250,
      "materialGain": 300
    }
  ],
  "totalExtracted": 5
}
```

---

## Project Structure

```
src/
├── api/
│   └── routes/
│       └── puzzle.routes.ts         # POST /puzzles/extract
│
├── services/
│   ├── PuzzleExtractionService.ts   # Main extraction logic
│   ├── SolutionSequenceService.ts   # Generate move sequences
│   └── TacticalThemeService.ts      # Detect tactical themes
│
├── types/
│   └── puzzle.types.ts              # Puzzle interfaces
│
└── config/
    └── puzzleConstants.ts           # Thresholds & limits
```

---

## Puzzle Quality Criteria

### 1. Eligible Mistakes

Only create puzzles from positions where:
- Player made a significant error (cpLoss >= 100)
- Position is not already lost (eval > -200cp)
- Position is not already won (eval < +600cp)
- Move number >= 6 (skip opening theory)
- NOT a trivial recapture

### 2. Solution Sequence Requirements

Generate solution sequences that:
- Maximum 8 moves (4 player moves + responses)
- End when advantage is clear (>= 300cp swing)
- Prefer puzzles with single clear best move at each step
- All moves must be "only moves" or clearly best

### 3. Quality Scoring

Each puzzle gets a quality score based on:

| Factor | Points |
|--------|--------|
| Has tactical theme (fork, pin, etc.) | +30 |
| Material gain >= 100cp | +20 |
| Unique best move (no alternatives) | +25 |
| Solution length 2-4 moves | +15 |
| Clear evaluation swing (>200cp) | +10 |

**Minimum quality score: 50 points**

---

## Solution Sequence Generation

### Algorithm

```typescript
function generateSolution(fen: string, firstMove: string): SolutionMove[] {
  const solution: SolutionMove[] = [];
  const chess = new Chess(fen);

  // Add first move (the missed move)
  solution.push({ uci: firstMove, isPlayerMove: true });
  chess.move(parseUci(firstMove));

  // Generate continuation (max 8 moves total)
  for (let i = 0; i < 7; i++) {
    const analysis = await stockfish.analyze(chess.fen(), { depth: 18 });
    const bestMove = analysis.bestMove;

    // Check if puzzle should end
    if (isPuzzleComplete(analysis, solution)) break;

    // Add opponent response or player continuation
    const isPlayerMove = i % 2 === 1;
    solution.push({
      uci: bestMove,
      isPlayerMove,
      fen: chess.fen()
    });

    chess.move(parseUci(bestMove));
  }

  return solution;
}
```

### Puzzle Completion Criteria

Stop generating moves when:
1. Evaluation advantage >= 300cp achieved
2. Checkmate delivered
3. Material gain is locked in (captured piece)
4. 8 moves reached
5. Multiple equally good moves exist (no clear continuation)

---

## Tactical Theme Detection

### Supported Themes

| Theme | Detection Method |
|-------|-----------------|
| `fork` | Piece attacks 2+ pieces after move |
| `pin` | Piece attacks through pinned piece |
| `skewer` | Attack on valuable piece, less valuable behind |
| `discovery` | Piece moves, revealing attack |
| `double_check` | King in check from 2 pieces |
| `back_rank` | Mate threat on 8th/1st rank |
| `deflection` | Force piece away from defense |
| `attraction` | Force piece to bad square |
| `clearance` | Sacrifice to open line |
| `x_ray` | Attack through piece |
| `zwischenzug` | Intermediate move |
| `quiet_move` | Strong non-capturing move |

---

## Puzzle Types

### 1. Mistake Puzzles
- Player made blunder/mistake/miss
- Puzzle: Find the move they should have played
- Source: `markerType in ['blunder', 'mistake', 'miss']`

### 2. Missed Tactic Puzzles
- Position had brilliant/great tactic
- Player played different (suboptimal) move
- Puzzle: Find the tactic they missed
- Source: `markerType in ['inaccuracy', 'good']` + tactical theme exists

### 3. Brilliant Move Puzzles (Positive)
- Player found a brilliant/great move
- Puzzle: Replay the tactic they found
- Source: `markerType in ['brilliant', 'great']`

---

## Constants

```typescript
// Puzzle extraction limits
const MAX_PUZZLES_PER_GAME = 6;
const MAX_MISSED_TACTICS = 3;
const MAX_POSITIVE_PUZZLES = 2;
const MIN_PUZZLES_TARGET = 3;

// Quality thresholds
const MIN_CP_LOSS = 100;        // Only significant mistakes
const MIN_MOVE_NUMBER = 6;      // Skip opening
const MAX_LOSING_EVAL = -200;   // Skip lost positions
const MAX_WINNING_EVAL = 600;   // Skip won positions

// Solution sequence
const MAX_SOLUTION_MOVES = 8;
const MIN_ADVANTAGE_TO_END = 300;  // cp to consider puzzle "won"
const UNIQUE_MOVE_THRESHOLD = 30;  // cp difference for "only move"
```

---

## Implementation Phases

### Phase 1: Core Extraction (Copy from Frontend)
1. Create `puzzle.types.ts` with interfaces
2. Create `puzzleConstants.ts` with thresholds
3. Port `PuzzleExtractionService.ts`
4. Port `TacticalThemeService.ts`
5. Create `puzzle.routes.ts` endpoint

### Phase 2: Solution Sequences
1. Create `SolutionSequenceService.ts`
2. Implement depth-first solution search
3. Add "only move" detection
4. Add puzzle quality scoring

### Phase 3: Integration
1. Add endpoint to review flow
2. Return puzzles with game review results
3. Store puzzles in database
4. Remove client-side extraction

---

## Database Schema

```sql
CREATE TABLE game_puzzles (
  id UUID PRIMARY KEY,
  game_review_id UUID REFERENCES game_reviews(id),
  user_id UUID REFERENCES profiles(id),
  fen TEXT NOT NULL,
  solution JSONB NOT NULL,  -- Array of moves
  solution_san TEXT[],      -- Human readable
  rating INTEGER,
  themes TEXT[],
  puzzle_type TEXT NOT NULL, -- 'mistake', 'missed_tactic', 'brilliant'
  move_number INTEGER,
  evaluation_swing INTEGER,
  material_gain INTEGER,
  quality_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Files to Create

| File | Description | Lines (est.) |
|------|-------------|--------------|
| `src/types/puzzle.types.ts` | Interfaces | ~50 |
| `src/config/puzzleConstants.ts` | Thresholds | ~40 |
| `src/services/PuzzleExtractionService.ts` | Extraction | ~300 |
| `src/services/SolutionSequenceService.ts` | Solutions | ~150 |
| `src/services/TacticalThemeService.ts` | Themes | ~200 |
| `src/api/routes/puzzle.routes.ts` | Endpoint | ~60 |
| **Total** | | **~800** |
