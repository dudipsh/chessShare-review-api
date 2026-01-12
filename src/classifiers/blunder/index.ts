/**
 * Blunder Classifier Module
 * Modular detection of "Blunder" moves (2.5+ pawn loss)
 */

export { BlunderDetector, blunderDetector } from './BlunderDetector.js';
export type { BlunderContext } from './BlunderDetector.js';
export { HangingPieceDetector } from './HangingPieceDetector.js';
export { MateBlindnessDetector } from './MateBlindnessDetector.js';
export {
  BLUNDER_THRESHOLDS,
  BlunderType,
  type BlunderResult,
} from './BlunderThresholds.js';

