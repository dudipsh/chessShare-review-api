/**
 * Inaccuracy Classifier Module
 * Modular detection of "Inaccuracy" moves (0.35-1.0 pawn loss)
 */

export { InaccuracyDetector, inaccuracyDetector } from './InaccuracyDetector.js';
export type { InaccuracyContext } from './InaccuracyDetector.js';
export {
  INACCURACY_THRESHOLDS,
  InaccuracyType,
  type InaccuracyResult,
} from './InaccuracyThresholds.js';

