/**
 * BrilliantDetector - ה-Orchestrator המרכזי לזיהוי מהלכים מבריקים
 * מתאם את כל ה-analyzers ומחליט אם מהלך הוא Brilliant
 * 
 * מחמיר מאוד - מתאים ל-Chess.com:
 * 1. חייב להיות Best (או כמעט)
 * 2. חייב להיות הקרבה אמיתית עם תמורה
 * 3. לא לקיחות פשוטות / recaptures / מהלכי רגלי רגילים
 * 4. המהלך חייב לשנות את תוצאת המשחק (לא רק לשמור על מט קיים)
 */

import { Chess } from 'chess.js';
import { BRILLIANT_THRESHOLDS, BrilliantMoveType, PIECE_VALUES } from './BrilliantThresholds.js';
import { SacrificeAnalyzer } from './SacrificeAnalyzer.js';
import { TacticalMotifDetector } from './TacticalMotifDetector.js';

export interface BrilliantDetectionResult {
  isBrilliant: boolean;
  brilliantType?: BrilliantMoveType;
  reason?: string;
  confidence: number; // 0-100
}

export class BrilliantDetector {
  private sacrificeAnalyzer = new SacrificeAnalyzer();
  private tacticalDetector = new TacticalMotifDetector();
  
  /**
   * נקודת הכניסה הראשית - האם המהלך מבריק?
   * 
   * מבריק = הקרבה אמיתית עם תמורה, לא סתם מהלך טוב!
   */
  isBrilliant(ctx: {
    move: any;
    fenBefore: string;
    fenAfter: string;
    evalBefore: number;
    evalAfter: number;
    isWhiteMove: boolean;
    centipawnLoss: number;
    topMoves: Array<{ uci: string; cp: number }>;
    playedMoveUci: string;
    moveNumber?: number;
    topMovesAfter?: Array<{ uci: string; cp: number }>;
  }): BrilliantDetectionResult {
    const { move, fenBefore, fenAfter, evalBefore, evalAfter, isWhiteMove, 
            centipawnLoss, topMoves, playedMoveUci, moveNumber, topMovesAfter } = ctx;
    
    // ==========================================
    // שלב 0: בדיקות מאולצות - חייב להיות ראשון!
    // ==========================================
    
    // תנאי 0.1: לא תגובה לשח - כל מהלך בשח הוא מאולץ!
    // חייב להיות ראשון כי זה פוסל מיידית
    if (this._isInCheck(fenBefore)) {
      return this._notBrilliant('Response to check - all check responses are forced');
    }
    
    // תנאי 0.2: לא forced move (מהלך יחיד אפשרי)
    if (this._isForcedMove(fenBefore)) {
      return this._notBrilliant('Forced move - only one legal option');
    }
    
    // ==========================================
    // שלב 1: תנאי סף מחמירים מאוד (MUST PASS)
    // ==========================================
    
    // תנאי 1: Best move או קרוב מאוד (מקסימום 15cp loss)
    const isBestOrNear = this._isBestOrNearBest(playedMoveUci, topMoves, centipawnLoss);
    if (!isBestOrNear) {
      return this._notBrilliant('Not best or near-best move');
    }
    
    // תנאי 2: המהלך מחזיק טקטית
    if (centipawnLoss > BRILLIANT_THRESHOLDS.MAX_CP_LOSS) {
      return this._notBrilliant(`Too much centipawn loss: ${centipawnLoss}cp`);
    }
    
    // תנאי 3: לא book move
    if (this._isBookMove(moveNumber)) {
      return this._notBrilliant('Book move');
    }
    
    // 🆕 תנאי 5: לא מהלך רגלי פשוט (רק הקרבות רגלי מותרות)
    if (this._isSimplePawnMove(move)) {
      return this._notBrilliant('Simple pawn move - not brilliant');
    }
    
    // 🆕 תנאי 6: המהלך חייב לשפר את המצב - לא רק לשמור על מט קיים!
    if (this._isMateUnchanged(evalBefore, evalAfter, isWhiteMove)) {
      return this._notBrilliant('Mate sequence unchanged - not improving position');
    }
    
    // תנאי 7: לא לקיחה פשוטה של כלי לא מוגן
    if (this._isSimpleFreeCapture(move, fenBefore)) {
      return this._notBrilliant('Simple free capture - obvious move');
    }
    
    // תנאי 8: לא לקיחה פשוטה של המלך
    if (this._isSimpleKingCapture(move, fenBefore, topMoves)) {
      return this._notBrilliant('Simple king recapture - obvious move');
    }
    
    // תנאי 9: לא recapture פשוט
    if (this._isSimpleRecapture(move, fenBefore, topMoves)) {
      return this._notBrilliant('Simple recapture - obvious defensive move');
    }
    
    // תנאי 10: לא יתרון חומרי פשוט
    if (this._isSimpleMaterialGain(move, evalBefore, evalAfter, isWhiteMove)) {
      return this._notBrilliant('Simple material gain - not tactical brilliance');
    }

    // חישוב eval swing
    const evalSwing = this._calculateEvalSwing(evalBefore, evalAfter, isWhiteMove);

    // ==========================================
    // שלב 2: קריטריון יחיד - הקרבה עם תמורה!
    // מבריק = הקרבה. נקודה.
    // 🔧 תיקון: בודקים הקרבה לפני בדיקת אלטרנטיבות!
    // הקרבה היא מבריקה גם אם יש מהלכים טובים אחרים
    // ==========================================

    const sacrificeResult = this.sacrificeAnalyzer.analyzeSacrifice(
      move, fenBefore, evalBefore, evalAfter, isWhiteMove, fenAfter, topMovesAfter
    );

    if (sacrificeResult.isSacrifice && sacrificeResult.hasCompensation) {
      // בדיקת false-positive
      if (this._isFalsePositiveSacrifice(sacrificeResult, move)) {
        return this._notBrilliant('False positive sacrifice');
      }
      
      // הקרבה של כלי תלוי שלקיחתו = טעות
      // 🔧 תיקון: לא דורשים evalSwing חיובי להקרבת כלי תלוי!
      // הרעיון: המהלך מציע כלי, ואם היריב יאכל = זו טעות גדולה
      // זה מבריק גם אם האיוול לא משתפר מיד (כמו Rxe5+ במשחק של מגנוס)
      if (sacrificeResult.isHangingPieceSacrifice && sacrificeResult.takingIsMistake) {
        return {
          isBrilliant: true,
          brilliantType: BrilliantMoveType.SACRIFICE,
          reason: `Hanging ${sacrificeResult.sacrificeType} - taking it is a mistake!`,
          confidence: 95,
        };
      }
      
      // הקרבה שמובילה למט (אבל רק אם המט לא היה קיים לפני!)
      if (sacrificeResult.leadsToMate) {
        // וודא שלפני המהלך לא היה כבר מט
        if (!this._wasAlreadyMate(evalBefore, isWhiteMove)) {
          return {
            isBrilliant: true,
            brilliantType: BrilliantMoveType.SACRIFICE,
            reason: `${sacrificeResult.sacrificeType} sacrifice leading to mate in ${sacrificeResult.mateIn}`,
            confidence: 99,
          };
        }
      }
      
      // הקרבה אחרת - נדרש שינוי הערכה משמעותי
      if (evalSwing >= BRILLIANT_THRESHOLDS.MIN_EVAL_SWING) {
        return {
          isBrilliant: true,
          brilliantType: BrilliantMoveType.SACRIFICE,
          reason: `Sacrifice (${sacrificeResult.sacrificeType}) leading to ${sacrificeResult.compensationType}`,
          confidence: 95,
        };
      }
    }

    // 🆕 תנאי 11: אין אלטרנטיבות טובות (פער גדול מהמהלך השני)
    // 🔧 תיקון: בדיקה זו רק למהלכים שאינם הקרבה!
    if (this._hasGoodAlternatives(topMoves)) {
      return this._notBrilliant('Has good alternatives - not unique');
    }

    // אין הקרבה = לא מבריק
    return this._notBrilliant('No sacrifice detected - brilliant requires sacrifice');
  }
  
  /**
   * בדיקה אם המהלך הוא Best או קרוב מאוד
   */
  private _isBestOrNearBest(
    playedUci: string,
    topMoves: Array<{ uci: string; cp: number }>,
    centipawnLoss: number
  ): boolean {
    if (!topMoves || topMoves.length === 0) return false;
    
    const isBest = playedUci.toLowerCase() === topMoves[0].uci.toLowerCase();
    if (isBest) return true;
    
    return centipawnLoss <= BRILLIANT_THRESHOLDS.MAX_GAP_FROM_BEST;
  }
  
  /**
   * 🆕 בדיקה אם זה מהלך רגלי פשוט (לא הקרבה)
   */
  private _isSimplePawnMove(move: any): boolean {
    if (move.piece !== 'p') return false;
    
    // הקרבת רגלי (רגלי אוכל משהו יקר יותר) = מותר
    if (move.captured) {
      const capturedValue = PIECE_VALUES[move.captured as keyof typeof PIECE_VALUES] || 0;
      // אם הרגלי אוכל משהו שווה יותר מרגלי - זה לא הקרבה
      // אם הרגלי נאכל בחזרה - זו הקרבה (יטופל ב-SacrificeAnalyzer)
      return false; // לקיחות רגלי יטופלו בנפרד
    }
    
    // הכתרה = מותר
    if (move.promotion) return false;
    
    // מהלך רגלי פשוט = לא מבריק
    return true;
  }
  
  /**
   * 🆕 בדיקה אם המט לא השתנה
   * אם לפני המהלך היה מט ב-X ואחריו עדיין מט ב-X (או יותר) = לא שיפרנו כלום
   */
  private _isMateUnchanged(evalBefore: number, evalAfter: number, isWhiteMove: boolean): boolean {
    const MATE_THRESHOLD = 97000;
    
    // בדוק אם לפני המהלך היה מט לטובת השחקן
    const wasMateForPlayer = isWhiteMove 
      ? evalBefore >= MATE_THRESHOLD 
      : evalBefore <= -MATE_THRESHOLD;
    
    if (!wasMateForPlayer) return false; // לא היה מט לפני - בסדר
    
    // בדוק אם אחרי המהלך עדיין מט לטובת השחקן
    const isMateAfter = isWhiteMove
      ? evalAfter >= MATE_THRESHOLD
      : evalAfter <= -MATE_THRESHOLD;
    
    if (!isMateAfter) return false; // המט נעלם - משהו קרה
    
    // חשב את מספר המהלכים למט לפני ואחרי
    const mateInBefore = Math.round((100000 - Math.abs(evalBefore)) / 100);
    const mateInAfter = Math.round((100000 - Math.abs(evalAfter)) / 100);
    
    // אם המט לא השתפר (או אפילו התארך) = לא מבריק
    // מבריק רק אם קיצרנו את המט משמעותית (לפחות 2 מהלכים)
    return mateInAfter >= mateInBefore - 1;
  }
  
  /**
   * 🆕 בדיקה אם כבר היה מט לפני המהלך
   */
  private _wasAlreadyMate(evalBefore: number, isWhiteMove: boolean): boolean {
    const MATE_THRESHOLD = 97000;
    return isWhiteMove 
      ? evalBefore >= MATE_THRESHOLD 
      : evalBefore <= -MATE_THRESHOLD;
  }
  
  /**
   * בדיקה אם יש אלטרנטיבות טובות
   */
  private _hasGoodAlternatives(topMoves: Array<{ uci: string; cp: number }>): boolean {
    if (!topMoves || topMoves.length < 2) return false;
    
    const bestEval = topMoves[0].cp;
    const secondBestEval = topMoves[1].cp;
    const gap = Math.abs(bestEval - secondBestEval);
    
    return gap < BRILLIANT_THRESHOLDS.MIN_GAP_TO_SECOND_BEST;
  }
  
  /**
   * בדיקה אם זו לקיחה פשוטה של כלי לא מוגן
   */
  private _isSimpleFreeCapture(move: any, fenBefore: string): boolean {
    if (!move.captured) return false;
    
    try {
      const chess = new Chess(fenBefore);
      const targetSquare = move.to;
      
      chess.move(move);
      
      const responseMoves = chess.moves({ verbose: true });
      const recaptureMoves = responseMoves.filter(
        m => m.to === targetSquare && m.captured
      );
      
      if (recaptureMoves.length === 0) {
        const capturedValue = PIECE_VALUES[move.captured as keyof typeof PIECE_VALUES] || 0;
        if (capturedValue >= 100) {
          return true;
        }
      }
    } catch {
      // שגיאה
    }
    
    return false;
  }
  
  /**
   * בדיקה אם המהלך רק מוביל יתרון חומרי פשוט
   */
  private _isSimpleMaterialGain(
    move: any, 
    evalBefore: number,
    evalAfter: number,
    isWhiteMove: boolean
  ): boolean {
    if (!move.captured) return false;
    
    const movedValue = PIECE_VALUES[move.piece as keyof typeof PIECE_VALUES] || 0;
    const capturedValue = PIECE_VALUES[move.captured as keyof typeof PIECE_VALUES] || 0;
    
    // אם לקחנו כלי שווה או יקר יותר (לא הקרבה)
    if (capturedValue >= movedValue) {
      const evalSwing = this._calculateEvalSwing(evalBefore, evalAfter, isWhiteMove);
      
      // אם ה-eval swing פחות או יותר מתאים לערך החומר - זה פשוט
      if (Math.abs(evalSwing - capturedValue) < 150) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * בדיקה אם המהלך משנה את המשחק
   */
  private _isGameChanging(
    evalSwing: number,
    evalAfter: number,
    isWhiteMove: boolean
  ): boolean {
    const MATE_THRESHOLD = 97000;
    if (Math.abs(evalAfter) >= MATE_THRESHOLD) {
      const mateForPlayer = isWhiteMove ? evalAfter > 0 : evalAfter < 0;
      return mateForPlayer;
    }
    
    return evalSwing >= BRILLIANT_THRESHOLDS.MIN_EVAL_SWING;
  }
  
  /**
   * בדיקה אם זה book move
   */
  private _isBookMove(moveNumber?: number): boolean {
    if (!BRILLIANT_THRESHOLDS.REJECT_BOOK_MOVES) return false;
    if (!moveNumber) return false;
    
    return moveNumber <= BRILLIANT_THRESHOLDS.BOOK_MOVES_MAX_MOVE_NUMBER;
  }
  
  /**
   * חישוב שינוי הערכה
   */
  private _calculateEvalSwing(
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
   * בדיקת false positive להקרבה
   */
  private _isFalsePositiveSacrifice(sacrificeResult: any, move: any): boolean {
    // חילופי מלכות
    if (BRILLIANT_THRESHOLDS.REJECT_AUTOMATIC_QUEEN_TRADES) {
      if (move.piece === 'q' && move.captured === 'q') {
        return true;
      }
    }
    
    // לקיחת כלי חינם
    if (BRILLIANT_THRESHOLDS.REJECT_FREE_PIECES) {
      if (sacrificeResult.immediateReturn > sacrificeResult.sacrificeValue) {
        return true;
      }
    }
    
    // טרייד שווה
    if (BRILLIANT_THRESHOLDS.REJECT_REGULAR_TRADES) {
      const diff = Math.abs(sacrificeResult.sacrificeValue - sacrificeResult.immediateReturn);
      if (diff < 50) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * תוצאה שלילית
   */
  private _notBrilliant(reason: string): BrilliantDetectionResult {
    return {
      isBrilliant: false,
      reason,
      confidence: 0,
    };
  }
  
  /**
   * בדיקה אם זה מהלך מאולץ
   */
  private _isForcedMove(fenBefore: string): boolean {
    try {
      const chess = new Chess(fenBefore);
      return chess.moves().length === 1;
    } catch {
      return false;
    }
  }
  
  /**
   * בדיקה אם השחקן בשח
   * כל תגובה לשח היא מהלך מאולץ - לא יכול להיות מבריק
   */
  private _isInCheck(fenBefore: string): boolean {
    try {
      const chess = new Chess(fenBefore);
      return chess.isCheck();
    } catch {
      return false;
    }
  }
  
  /**
   * בדיקה אם זו לקיחה פשוטה של המלך
   */
  private _isSimpleKingCapture(
    move: any, 
    fenBefore: string, 
    topMoves: Array<{ uci: string; cp: number }>
  ): boolean {
    if (move.piece !== 'k' || !move.captured) return false;
    
    try {
      const chess = new Chess(fenBefore);
      const legalMoves = chess.moves({ verbose: true });
      
      if (legalMoves.length <= 3) return true;
      
      if (topMoves.length >= 2) {
        const gap = Math.abs(topMoves[0].cp - topMoves[1].cp);
        if (gap > 200) return true;
      }
    } catch {
      // שגיאה
    }
    
    return false;
  }
  
  /**
   * בדיקה אם זו לקיחה פשוטה (recapture)
   */
  private _isSimpleRecapture(
    move: any, 
    fenBefore: string, 
    topMoves: Array<{ uci: string; cp: number }>
  ): boolean {
    if (!move.captured) return false;
    
    const movedPieceValue = PIECE_VALUES[move.piece as keyof typeof PIECE_VALUES] || 0;
    const capturedPieceValue = PIECE_VALUES[move.captured as keyof typeof PIECE_VALUES] || 0;
    
    // אם הכלי שזז שווה הרבה יותר = אולי הקרבה
    const isSacrifice = movedPieceValue > capturedPieceValue + 150;
    if (isSacrifice) return false;
    
    try {
      const chess = new Chess(fenBefore);
      const targetSquare = move.to;
      
      chess.move(move);
      
      const attackers = chess.moves({ verbose: true }).filter(
        m => m.to === targetSquare && m.captured
      );
      
      // אכילה חינם
      if (attackers.length === 0) {
        return true;
      }
      
      // אם ההפרש ל-topMove השני גדול = מהלך ברור
      if (topMoves.length >= 2) {
        const gap = Math.abs(topMoves[0].cp - topMoves[1].cp);
        if (gap > 100) return true;
      }
      
    } catch {
      // שגיאה
    }
    
    return false;
  }
}
