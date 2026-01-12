/**
 * Utility functions for evaluation handling
 */

const MATE_THRESHOLD = 97000;

export class EvaluationUtils {
  /**
   * Check if a score represents a mate (checkmate) position
   */
  static isMateScore(evaluation: number): boolean {
    return Math.abs(evaluation) >= MATE_THRESHOLD;
  }

  /**
   * Extract mate-in-N from evaluation
   * Returns positive N if WHITE has mate, negative if BLACK has mate, null if not mate
   * 
   * ⚠️ CRITICAL: Stockfish returns evaluation from WHITE's perspective!
   * - evaluation > 0 (e.g., 99700) = mate for WHITE (higher number = closer to mate)
   * - evaluation < 0 (e.g., -99700) = mate for BLACK
   */
  static extractMateIn(evaluation: number): number | null {
    if (!this.isMateScore(evaluation)) return null;
    
    // ✅ FIXED: Correct sign handling
    // evaluation > 0 means mate for WHITE
    // evaluation < 0 means mate for BLACK
    const sign = evaluation > 0 ? 1 : -1;
    const mateIn = Math.ceil((100000 - Math.abs(evaluation)) / 100);
    return sign * mateIn;
  }

  /**
   * Convert evaluation to player's perspective
   */
  static toPlayerPerspective(evaluation: number, isWhiteMove: boolean): number {
    return isWhiteMove ? evaluation : -evaluation;
  }

  /**
   * Calculate improvement from player's perspective
   */
  static calculateImprovement(
    evalBefore: number,
    evalAfter: number,
    isWhiteMove: boolean
  ): number {
    const rawChange = evalAfter - evalBefore;
    return isWhiteMove ? rawChange : -rawChange;
  }

  /**
   * Check if player is in winning position
   */
  static isWinningPosition(playerEval: number, threshold: number = 200): boolean {
    return playerEval >= threshold;
  }

  /**
   * Check if position is decisive
   */
  static isDecisiveAdvantage(playerEval: number): boolean {
    return playerEval >= 250;
  }
}


