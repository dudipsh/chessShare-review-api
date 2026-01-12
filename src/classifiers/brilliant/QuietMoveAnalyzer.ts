/**
 * QuietMoveAnalyzer - ניתוח מהלכים שקטים מכריעים
 * מטרה: לזהות מהלכים ללא שח/לקיחה שיוצרים איומים מכריעים
 */

import { Chess } from 'chess.js';
import { BRILLIANT_THRESHOLDS } from './BrilliantThresholds.js';

export interface QuietMoveResult {
  isQuiet: boolean;
  isCrushing: boolean;
  hasMultipleThreats: boolean;
  evalImprovement: number;
  threatTypes: string[];
}

export class QuietMoveAnalyzer {
  /**
   * ניתוח מהלך שקט - האם זה מהלך מכריע
   */
  analyzeQuietMove(
    move: any,
    fenBefore: string,
    fenAfter: string,
    evalBefore: number,
    evalAfter: number,
    isWhiteMove: boolean
  ): QuietMoveResult {
    // 1. וודא שזה מהלך שקט (לא שח, לא לקיחה)
    const isQuiet = this._isQuietMove(move);
    
    if (!isQuiet) {
      return this._notQuietResult();
    }
    
    // 2. חשב שיפור הערכה
    const evalImprovement = this._calculateEvalImprovement(
      evalBefore,
      evalAfter,
      isWhiteMove
    );
    
    // 3. בדוק אם יש שיפור משמעותי
    if (evalImprovement < BRILLIANT_THRESHOLDS.QUIET_MIN_EVAL_SWING) {
      return {
        isQuiet: true,
        isCrushing: false,
        hasMultipleThreats: false,
        evalImprovement,
        threatTypes: [],
      };
    }
    
    // 4. נתח איומים
    const threats = this._analyzeThreats(fenAfter, isWhiteMove);
    
    // 5. וודא שהגנה לא מצליחה
    const defenseHolds = this._checkBestDefense(fenAfter, evalAfter, isWhiteMove);
    
    const isCrushing = evalImprovement >= BRILLIANT_THRESHOLDS.QUIET_MIN_EVAL_SWING &&
                       !defenseHolds &&
                       (threats.length >= 2 || !BRILLIANT_THRESHOLDS.QUIET_REQUIRES_MULTIPLE_THREATS);
    
    return {
      isQuiet: true,
      isCrushing,
      hasMultipleThreats: threats.length >= 2,
      evalImprovement,
      threatTypes: threats,
    };
  }
  
  /**
   * בדיקה אם מהלך שקט
   */
  private _isQuietMove(move: any): boolean {
    // לא שח
    const hasCheck = move.san?.includes('+') || move.san?.includes('#');
    if (hasCheck) return false;
    
    // לא לקיחה
    const isCapture = move.san?.includes('x') || move.captured;
    if (isCapture) return false;
    
    return true;
  }
  
  /**
   * חישוב שיפור הערכה
   */
  private _calculateEvalImprovement(
    evalBefore: number,
    evalAfter: number,
    isWhiteMove: boolean
  ): number {
    if (isWhiteMove) {
      return evalAfter - evalBefore;
    } else {
      return evalBefore - evalAfter;
    }
  }
  
  /**
   * ניתוח איומים שנוצרו
   */
  private _analyzeThreats(fenAfter: string, isWhiteMove: boolean): string[] {
    const threats: string[] = [];
    
    try {
      const chess = new Chess(fenAfter);
      const moves = chess.moves({ verbose: true }) as any[];
      
      // בדוק איומים שונים
      const hasCheckThreat = moves.some(m => {
        const testChess = new Chess(fenAfter);
        testChess.move(m);
        return testChess.isCheck();
      });
      
      if (hasCheckThreat) {
        threats.push('check_threat');
      }
      
      // בדוק איומי לקיחה על כלים חשובים
      const captureMoves = moves.filter(m => m.captured);
      if (captureMoves.length >= 2) {
        threats.push('multiple_capture_threats');
      }
      
      // בדוק איום מט
      const mateThreat = moves.some(m => {
        const testChess = new Chess(fenAfter);
        try {
          testChess.move(m);
          return testChess.isCheckmate();
        } catch {
          return false;
        }
      });
      
      if (mateThreat) {
        threats.push('mate_threat');
      }
      
    } catch (error) {
      // שגיאה בניתוח - החזר רשימה ריקה
    }
    
    return threats;
  }
  
  /**
   * בדיקה אם ההגנה הטובה ביותר מחזיקה
   */
  private _checkBestDefense(
    fenAfter: string,
    evalAfter: number,
    isWhiteMove: boolean
  ): boolean {
    // אם ההערכה עדיין חזקה מאוד לטובת השחקן - ההגנה לא מחזיקה
    const DECISIVE_ADVANTAGE = 300; // 3 pawns
    
    const playerEval = isWhiteMove ? evalAfter : -evalAfter;
    
    // אם השחקן עדיין מוביל ב-3+ pawns, ההגנה לא מחזיקה
    return playerEval < DECISIVE_ADVANTAGE;
  }
  
  /**
   * תוצאה ריקה (לא מהלך שקט)
   */
  private _notQuietResult(): QuietMoveResult {
    return {
      isQuiet: false,
      isCrushing: false,
      hasMultipleThreats: false,
      evalImprovement: 0,
      threatTypes: [],
    };
  }
}

