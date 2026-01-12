/**
 * Great Move Classifier Module
 * Modular detection of "Great" moves following Chess.com style
 */

export { GreatMoveDetector, greatMoveDetector } from './GreatMoveDetector.js';
export type { GreatMoveContext } from './GreatMoveDetector.js';
export { CheckMoveAnalyzer } from './CheckMoveAnalyzer.js';
export { ForcingMoveAnalyzer } from './ForcingMoveAnalyzer.js';
export { 
  GREAT_MOVE_THRESHOLDS, 
  GreatMoveType,
  type GreatMoveResult 
} from './GreatMoveThresholds.js';

