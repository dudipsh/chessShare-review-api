/**
 * Game Review Classifiers - Modular move classification
 */

export { EvaluationUtils } from './EvaluationUtils.js';
export { CentipawnLossCalculator } from './CentipawnLossCalculator.js';
export { MateSequenceHandler } from './MateSequenceHandler.js';
export { TopMovesClassifier } from './TopMovesClassifier.js';
export { GreatMoveClassifier } from './GreatMoveClassifier.js';
export { EarlyReturnChecker } from './EarlyReturnChecker.js';
export { ContextExtractor } from './ContextExtractor.js';
export { MateSafetyChecker } from './MateSafetyChecker.js';
export type { MoveContext } from './ContextExtractor.js';

// ═══════════════════════════════════════════════════════════════════════
// Modular Classification System
// ═══════════════════════════════════════════════════════════════════════

// Brilliant Detection
export { BrilliantDetector } from './brilliant/index.js';

// Great Move Detection
export {
  GreatMoveDetector,
  greatMoveDetector,
  GREAT_MOVE_THRESHOLDS,
  GreatMoveType,
} from './great/index.js';
export type { GreatMoveContext, GreatMoveResult } from './great/index.js';

// Mistake Detection
export {
  MistakeDetector,
  mistakeDetector,
  MISTAKE_THRESHOLDS,
  MistakeType,
} from './mistake/index.js';
export type { MistakeContext, MistakeResult } from './mistake/index.js';

// Blunder Detection
export {
  BlunderDetector,
  blunderDetector,
  BLUNDER_THRESHOLDS,
  BlunderType,
} from './blunder/index.js';
export type { BlunderContext, BlunderResult } from './blunder/index.js';

// Miss Detection
export {
  MissDetector,
  missDetector,
  MISS_THRESHOLDS,
  MissType,
} from './miss/index.js';
export type { MissContext, MissResult } from './miss/index.js';

// Inaccuracy Detection
export {
  InaccuracyDetector,
  inaccuracyDetector,
  INACCURACY_THRESHOLDS,
  InaccuracyType,
} from './inaccuracy/index.js';
export type { InaccuracyContext, InaccuracyResult } from './inaccuracy/index.js';

// Best Move Detection
export { BestMoveClassifier, bestMoveClassifier } from './BestMoveClassifier.js';
export type { BestMoveInput, BestMoveResult } from './BestMoveClassifier.js';

// Book Move Detection
export { BookMoveClassifier, bookMoveClassifier } from './BookMoveClassifier.js';
export type { BookMoveInput, BookMoveResult, OpeningInfo } from './BookMoveClassifier.js';
