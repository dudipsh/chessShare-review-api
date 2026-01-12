/**
 * Brilliant Move Detection - Modular System
 * ייצוא מרכזי לכל מערכת זיהוי המהלכים המבריקים
 */

export { BrilliantDetector } from './BrilliantDetector.js';
export type { BrilliantDetectionResult } from './BrilliantDetector.js';

export { SacrificeAnalyzer } from './SacrificeAnalyzer.js';
export type { SacrificeResult } from './SacrificeAnalyzer.js';

export { QuietMoveAnalyzer } from './QuietMoveAnalyzer.js';
export type { QuietMoveResult } from './QuietMoveAnalyzer.js';

export { OnlyMoveAnalyzer } from './OnlyMoveAnalyzer.js';
export type { OnlyMoveResult } from './OnlyMoveAnalyzer.js';

export { TacticalMotifDetector } from './TacticalMotifDetector.js';
export type { TacticalMotif } from './TacticalMotifDetector.js';

export { 
  BRILLIANT_THRESHOLDS, 
  PIECE_VALUES,
  BrilliantLevel,
  SacrificeType,
  BrilliantMoveType,
} from './BrilliantThresholds.js';

