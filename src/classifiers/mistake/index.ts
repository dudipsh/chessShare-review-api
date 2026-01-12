/**
 * Mistake Classifier Module
 * Modular detection of "Mistake" moves (1.5-2.5 pawn loss)
 */

export { MistakeDetector, mistakeDetector } from './MistakeDetector.js';
export type { MistakeContext } from './MistakeDetector.js';
export { PositionalMistakeAnalyzer } from './PositionalMistakeAnalyzer.js';
export { TacticalMistakeAnalyzer } from './TacticalMistakeAnalyzer.js';
export {
  MISTAKE_THRESHOLDS,
  MistakeType,
  type MistakeResult,
} from './MistakeThresholds.js';

