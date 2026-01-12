/**
 * Miss Classifier Module
 * Modular detection of "Miss" moves (1.0-1.5 pawn loss)
 */

export { MissDetector, missDetector } from './MissDetector.js';
export type { MissContext } from './MissDetector.js';
export { TacticalMissAnalyzer } from './TacticalMissAnalyzer.js';
export { WinningMoveAnalyzer } from './WinningMoveAnalyzer.js';
export {
  MISS_THRESHOLDS,
  MissType,
  type MissResult,
} from './MissThresholds.js';

