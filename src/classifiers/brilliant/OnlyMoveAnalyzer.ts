/**
 * OnlyMoveAnalyzer - ניתוח "מהלך יחיד"
 * מטרה: לזהות מצבים שבהם המהלך הוא כמעט היחיד שמחזיק
 */

import { Chess } from 'chess.js';
import { BRILLIANT_THRESHOLDS } from './BrilliantThresholds.js';

export interface OnlyMoveResult {
  isOnlyMove: boolean;
  totalGoodMoves: number;
  gapToSecondBest: number;
  isComplexPosition: boolean;
}

export class OnlyMoveAnalyzer {
  /**
   * ניתוח אם המהלך הוא "only move"
   */
  analyzeOnlyMove(
    playedMoveUci: string,
    topMoves: Array<{ uci: string; cp: number }>,
    fenBefore: string,
    move?: any, // Add move object to check if it's a simple capture
    evalBefore?: number // Add eval to check if position is critical
  ): OnlyMoveResult {
    if (!topMoves || topMoves.length === 0) {
      return this._notOnlyMoveResult();
    }
    
    // ❌ EXCLUSION 1: פסול לקיחות פשוטות (אבל לא הקרבות!)
    // לקיחה פשוטה (capture) היא לא "only move brilliant"
    // אבל אם זו הקרבה (נותן כלי יקר יותר) - אל תפסול!
    if (move && move.captured) {
      const movedPieceValue = this._getPieceValue(move.piece);
      const capturedPieceValue = this._getPieceValue(move.captured);
      
      // אם הכלי שזז שווה יותר מהכלי שנתפס - זו אולי הקרבה
      // לדוגמה: מלכה (900) אוכלת צריח (500) = הקרבה!
      const isSacrificialCapture = movedPieceValue > capturedPieceValue + 200; // 2 pawns
      
      if (!isSacrificialCapture) {
        return this._notOnlyMoveResult();
      }
    }
    
    // ❌ EXCLUSION 2: פסול מצבים לא קריטיים
    // "Only move" צריך להיות במצב קריטי בלבד
    if (evalBefore !== undefined && !this._isCriticalPosition(evalBefore)) {
      return this._notOnlyMoveResult();
    }
    
    // 1. ספור מהלכים "טובים"
    const goodMoves = this._countGoodMoves(topMoves);
    
    // 2. חשב פער למהלך השני הטוב ביותר
    const gapToSecond = this._calculateGapToSecondBest(topMoves);
    
    // 3. בדוק אם העמדה מורכבת
    const isComplex = this._isComplexPosition(fenBefore);
    
    // 4. קבע אם זה only move
    const isOnlyMove = this._isOnlyMoveCandidate(goodMoves, gapToSecond, isComplex);
    
    return {
      isOnlyMove,
      totalGoodMoves: goodMoves,
      gapToSecondBest: gapToSecond,
      isComplexPosition: isComplex,
    };
  }
  
  /**
   * קבלת ערך כלי
   */
  private _getPieceValue(piece: string): number {
    const values: Record<string, number> = {
      'p': 100,
      'n': 320,
      'b': 330,
      'r': 500,
      'q': 900,
      'k': 20000,
    };
    return values[piece] || 0;
  }
  
  /**
   * בדיקה אם המצב קריטי
   * Only move brilliant צריך להיות במצב קריטי - כשמפסידים או צריכים הגנה מדויקת
   */
  private _isCriticalPosition(evalBefore: number): boolean {
    // מצב קריטי = מפסיד ב-200+ cp (2 pawns) או יותר
    const CRITICAL_THRESHOLD = 200;
    return Math.abs(evalBefore) >= CRITICAL_THRESHOLD;
  }
  
  /**
   * ספירת מהלכים טובים
   */
  private _countGoodMoves(topMoves: Array<{ uci: string; cp: number }>): number {
    if (topMoves.length === 0) return 0;
    
    const bestEval = topMoves[0].cp;
    const GOOD_THRESHOLD = 100; // מהלך טוב הוא עד 1 pawn מהטוב ביותר
    
    return topMoves.filter(move => {
      const gap = Math.abs(move.cp - bestEval);
      return gap <= GOOD_THRESHOLD;
    }).length;
  }
  
  /**
   * חישוב פער למהלך השני הטוב ביותר
   */
  private _calculateGapToSecondBest(topMoves: Array<{ uci: string; cp: number }>): number {
    if (topMoves.length < 2) {
      return Infinity; // אין מהלך שני - זה בהחלט only move!
    }
    
    const bestEval = topMoves[0].cp;
    const secondBestEval = topMoves[1].cp;
    
    return Math.abs(bestEval - secondBestEval);
  }
  
  /**
   * בדיקה אם העמדה מורכבת
   */
  private _isComplexPosition(fenBefore: string): boolean {
    try {
      const chess = new Chess(fenBefore);
      const moves = chess.moves({ verbose: true }) as any[];
      
      // עמדה מורכבת = הרבה אפשרויות
      const totalMoves = moves.length;
      if (totalMoves < 5) return false; // עמדה פשוטה
      
      // עמדה מורכבת = הרבה לקיחות/שחים אפשריים
      const captureMoves = moves.filter(m => m.captured).length;
      const checkMoves = moves.filter(m => {
        try {
          const testChess = new Chess(fenBefore);
          testChess.move(m);
          return testChess.isCheck();
        } catch {
          return false;
        }
      }).length;
      
      const tacticalMoves = captureMoves + checkMoves;
      
      // אם יש הרבה מהלכים טקטיים - העמדה מורכבת
      return tacticalMoves >= 3;
      
    } catch {
      return false;
    }
  }
  
  /**
   * קביעה אם זה מועמד ל-only move
   * משתמשים ב-MIN_GAP_TO_SECOND_BEST (80cp) כסף מינימלי
   */
  private _isOnlyMoveCandidate(
    goodMoves: number,
    gapToSecond: number,
    isComplex: boolean
  ): boolean {
    // תנאי 1: מעט מהלכים טובים (מקסימום 2)
    if (goodMoves > BRILLIANT_THRESHOLDS.MAX_GOOD_MOVES_FOR_ONLY) {
      return false;
    }
    
    // תנאי 2: פער גדול למהלך השני הטוב ביותר
    // משתמשים ב-MIN_GAP_TO_SECOND_BEST (80cp) כסף מינימלי בסיסי
    // אבל ל-only move צריך עוד יותר - MIN_GAP_FOR_ONLY_MOVE (150cp)
    const minGap = Math.max(
      BRILLIANT_THRESHOLDS.MIN_GAP_TO_SECOND_BEST,
      BRILLIANT_THRESHOLDS.MIN_GAP_FOR_ONLY_MOVE
    );
    if (gapToSecond < minGap) {
      return false;
    }
    
    // תנאי 3: העמדה צריכה להיות מורכבת (לא ברורה)
    if (!isComplex) {
      return false;
    }
    
    return true;
  }
  
  /**
   * תוצאה ריקה (לא only move)
   */
  private _notOnlyMoveResult(): OnlyMoveResult {
    return {
      isOnlyMove: false,
      totalGoodMoves: 0,
      gapToSecondBest: 0,
      isComplexPosition: false,
    };
  }
}

