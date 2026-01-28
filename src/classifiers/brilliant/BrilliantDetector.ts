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
    // 🆕 שלב 0.5: בדיקת הקרבת מלכה עם מט מאולץ
    // זה חייב לבוא לפני בדיקת cpLoss כי הקרבות מלכה מבריקות
    // יכולות להיראות כ"blunder" לסטוקפיש
    // ==========================================
    const queenSacWithMateResult = this._checkQueenSacrificeWithMate(
      move, fenBefore, fenAfter, isWhiteMove, evalBefore
    );
    if (queenSacWithMateResult.isBrilliant) {
      return queenSacWithMateResult;
    }

    // ==========================================
    // 🆕 שלב 0.55: לא מבריק אם כבר מנצח ב-300+ cp!
    // כשאתה מנצח בהפרש ענק, כל מהלך טוב הוא "פשוט"
    // Chess.com כמעט אף פעם לא נותן brilliant בעמדה כזו
    // ==========================================
    const playerEvalBefore = isWhiteMove ? evalBefore : -evalBefore;
    if (playerEvalBefore > 300) {
      return this._notBrilliant(`Already winning significantly (+${playerEvalBefore}cp) - no brilliant in winning positions`);
    }

    // ==========================================
    // 🆕 שלב 0.6: בדיקת הקרבה טקטית (מלכודת) - לפני בדיקת cpLoss!
    // מהלך שמציב כלי במקום שניתן לאכול אותו, אבל אם היריב יאכל = טעות
    // דוגמא: Qxd5!! שאם היריב אוכל Qxd5 יש פורק Nxc7+
    // ==========================================
    const tacticalTrapResult = this._checkTacticalTrapSacrifice(
      move, fenBefore, fenAfter, evalBefore, evalAfter, isWhiteMove, centipawnLoss, topMovesAfter
    );
    if (tacticalTrapResult.isBrilliant) {
      return tacticalTrapResult;
    }

    // ==========================================
    // שלב 1: תנאי סף מחמירים מאוד (MUST PASS)
    // ==========================================

    // תנאי 1: Best move או קרוב מאוד (מקסימום 15cp loss)
    const isBestOrNear = this._isBestOrNearBest(playedMoveUci, topMoves, centipawnLoss);
    if (!isBestOrNear) {
      return this._notBrilliant('Not best or near-best move');
    }

    // תנאי 2: המהלך מחזיק טקטית (לא טקטיות רגילות בלבד - הקרבות טקטיות כבר נבדקו!)
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

      // 🔧 לא מבריק אם השחקן בעמדה מפסידה!
      const playerEvalForSac = isWhiteMove ? evalBefore : -evalBefore;
      if (playerEvalForSac < -200) {
        return this._notBrilliant('Player is in losing position - sacrifice not brilliant');
      }

      // 🔧 לא מבריק אם כבר יש מט מאולץ לטובת השחקן
      const MATE_THRESHOLD_SAC = 97000;
      const alreadyHaveMateForSac = isWhiteMove ? evalBefore >= MATE_THRESHOLD_SAC : evalBefore <= -MATE_THRESHOLD_SAC;
      if (alreadyHaveMateForSac) {
        return this._notBrilliant('Already have forced mate - just finishing the game');
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
   *
   * 🔧 תיקון v3: יותר אגרסיבי בזיהוי recaptures!
   * אם זו לקיחה רגילה (לא הקרבה) והיריב יכול לקחת בחזרה = זה exchange/recapture פשוט
   */
  private _isSimpleRecapture(
    move: any,
    fenBefore: string,
    topMoves: Array<{ uci: string; cp: number }>
  ): boolean {
    if (!move.captured) return false;

    const movedPieceValue = PIECE_VALUES[move.piece as keyof typeof PIECE_VALUES] || 0;
    const capturedPieceValue = PIECE_VALUES[move.captured as keyof typeof PIECE_VALUES] || 0;

    // אם הכלי שזז שווה הרבה יותר = אולי הקרבה (לא recapture פשוט)
    const isSacrifice = movedPieceValue > capturedPieceValue + 150;
    if (isSacrifice) return false;

    try {
      const chess = new Chess(fenBefore);
      const targetSquare = move.to;

      chess.move(move);

      const recapturers = chess.moves({ verbose: true }).filter(
        m => m.to === targetSquare && m.captured
      );

      // אכילה חינם - מהלך ברור
      if (recapturers.length === 0) {
        return true;
      }

      // 🔧 תיקון v3: אם היריב יכול לקחת בחזרה ואנחנו לא מקריבים = exchange פשוט!
      // זה מכסה מקרים כמו Bxd5 אחרי שהיריב אכל משהו ב-d5
      // הכלי שלנו שווה פחות או שווה לכלי שאכלנו = לא הקרבה = לא מבריק
      if (recapturers.length > 0 && movedPieceValue <= capturedPieceValue) {
        return true;  // זה trade/exchange פשוט
      }

      // 🔧 תיקון v3: אפילו אם הכלי שלנו קצת יותר יקר (עד 100cp הפרש)
      // עדיין לא מבריק כי זה trade נורמלי
      if (recapturers.length > 0 && movedPieceValue <= capturedPieceValue + 100) {
        // בדוק אם זה המהלך הכי טוב במרחק גדול
        if (topMoves.length >= 2) {
          const gap = Math.abs(topMoves[0].cp - topMoves[1].cp);
          // רק אם הפער גדול מאוד (200+) אפשר לשקול שזה מיוחד
          if (gap < 200) {
            return true;  // לא מיוחד מספיק
          }
        } else {
          return true;  // אין מספיק מידע, נניח שזה פשוט
        }
      }

    } catch {
      // שגיאה
    }

    return false;
  }

  /**
   * 🆕 בדיקת הקרבה טקטית (מלכודת) - Tactical Trap Sacrifice
   *
   * מהלך שמציב כלי במקום שניתן לאכול אותו, אבל אם היריב יאכל = טעות גדולה
   * כי יש תגובה טקטית (פורק, שח נגלה, וכו') שמחזירה את החומר + רווח
   *
   * דוגמאות:
   * - Qxd5!! - המלכה "תלויה" אבל אם Qxd5 יש Nxc7+ פורק על המלך והמלכה
   * - Greek Gift Bxh7+! - הכלי "מוקרב" אבל יש מתקפת מט
   */
  private _checkTacticalTrapSacrifice(
    move: any,
    fenBefore: string,
    fenAfter: string,
    evalBefore: number,
    evalAfter: number,
    isWhiteMove: boolean,
    centipawnLoss: number,
    topMovesAfter?: Array<{ uci: string; cp: number }>
  ): BrilliantDetectionResult {
    // 🔧 תנאי 0: לא מבריק אם השחקן בעמדה מפסידה!
    // שחקן שמפסיד או הולך לקבל מט לא יכול לעשות מהלך מבריק
    const playerEval = isWhiteMove ? evalBefore : -evalBefore;
    if (playerEval < -200) { // מפסיד יותר מ-2 חיילים
      return this._notBrilliant('Player is in losing position - cannot be brilliant');
    }

    // 🔧 תנאי 0.5: לא מבריק אם היריב כבר הולך לקבל מט (ואני זה שמנצח)
    // במקרה כזה, כל מהלך טוב הוא לא "מבריק" - זה פשוט לסיים את המשחק
    const MATE_THRESHOLD = 97000;
    const iAlreadyHaveMate = isWhiteMove ? evalBefore >= MATE_THRESHOLD : evalBefore <= -MATE_THRESHOLD;
    if (iAlreadyHaveMate) {
      return this._notBrilliant('Already have forced mate - just finishing the game');
    }

    // תנאי 1: cpLoss בסף המורחב לטקטיות (50cp במקום 15cp)
    if (centipawnLoss > BRILLIANT_THRESHOLDS.TACTICAL_TRAP_MAX_CP_LOSS) {
      return this._notBrilliant('Too much centipawn loss for tactical trap');
    }

    // תנאי 2: לא מהלך פשוט
    if (this._isSimplePawnMove(move)) {
      return this._notBrilliant('Simple pawn move');
    }

    // תנאי 3: לא מט שלא השתנה
    if (this._isMateUnchanged(evalBefore, evalAfter, isWhiteMove)) {
      return this._notBrilliant('Mate unchanged');
    }

    try {
      const chessAfter = new Chess(fenAfter);
      const movedToSquare = move.to;
      const movedPiece = move.piece;
      const movedPieceValue = PIECE_VALUES[movedPiece as keyof typeof PIECE_VALUES] || 0;
      const capturedValue = move.captured ? PIECE_VALUES[move.captured as keyof typeof PIECE_VALUES] || 0 : 0;

      // מצא לקיחות אפשריות של הכלי שזז
      const opponentMoves = chessAfter.moves({ verbose: true });
      const capturesOfMovedPiece = opponentMoves.filter(
        m => m.to === movedToSquare && m.captured === movedPiece
      );

      if (capturesOfMovedPiece.length === 0) {
        return this._notBrilliant('Moved piece is not capturable - not a trap');
      }

      // בדוק כל לקיחה אפשרית של הכלי שזז
      for (const captureMove of capturesOfMovedPiece) {
        // 🔧 FIX: בדוק קודם אם הכלי באמת "תלוי" או שהוא מוגן
        // כלי מוגן שאכילתו = טעות זו לא "מלכודת מבריקה", זה פשוט כלי מוגן!
        const capturedByValue = PIECE_VALUES[captureMove.piece as keyof typeof PIECE_VALUES] || 0;

        // אם הכלי שאוכל שווה פחות מהכלי שזז = זו אכילה משתלמת, לא מלכודת
        // (למשל: חייל אוכל פרש = לא מלכודת, היריב מרוויח)
        if (capturedByValue < movedPieceValue) {
          // בדוק אם יש לקיחה חזרה (הכלי מוגן)
          const testChess = new Chess(fenAfter);
          testChess.move(captureMove);
          const recaptures = testChess.moves({ verbose: true }).filter(
            (m: any) => m.to === movedToSquare && m.captured
          );

          // אם יש לקיחה חזרה = הכלי פשוט מוגן, לא מלכודת מיוחדת
          if (recaptures.length > 0) {
            continue; // עבור ללקיחה הבאה
          }
        }

        // בדוק אם יש תגובה טקטית אחרי הלקיחה
        const tacticalResponse = this._findTacticalResponse(
          fenAfter, captureMove, isWhiteMove
        );

        if (tacticalResponse.hasResponse) {
          // חשב את ההקרבה הנטו
          const netSacrifice = movedPieceValue - capturedValue;

          // 🔧 FIX v2: מאוזן יותר - הקרבה של לפחות חייל עם תגובה טקטית
          if (netSacrifice >= 100) {
            return {
              isBrilliant: true,
              brilliantType: BrilliantMoveType.SACRIFICE,
              reason: `Tactical trap! ${movedPiece.toUpperCase()} appears hanging but capturing leads to ${tacticalResponse.type}`,
              confidence: 92,
            };
          }
        }

        // בדוק גם דרך topMovesAfter
        if (topMovesAfter && topMovesAfter.length > 0) {
          const captureUci = captureMove.from + captureMove.to;
          const bestMoveUci = topMovesAfter[0]?.uci?.toLowerCase();

          // אם הלקיחה היא לא המהלך הטוב ביותר
          if (captureUci.toLowerCase() !== bestMoveUci) {
            const captureInTopMoves = topMovesAfter.find(
              tm => tm.uci.toLowerCase() === captureUci.toLowerCase()
            );

            if (captureInTopMoves) {
              const bestEval = topMovesAfter[0].cp;
              const captureEval = captureInTopMoves.cp;
              const lossForTaking = Math.abs(bestEval - captureEval);

              // 🔧 FIX v2: קריטריונים מאוזנים יותר
              // מבריק אם:
              // 1. יש הקרבה (הכלי שזז שווה יותר ממה שאכל) - לפחות חייל
              // 2. היריב מפסיד משמעותית על הלקיחה (100+ cp)
              // 3. לא סתם כלי מוגן (ההפסד גדול מהפרש הערכים)
              const netSacrifice = movedPieceValue - capturedValue;
              const isRealSacrifice = netSacrifice >= 100; // לפחות חייל
              const lossIsSignificant = lossForTaking >= BRILLIANT_THRESHOLDS.MIN_OPPONENT_LOSS_FOR_TAKING;

              if (isRealSacrifice && lossIsSignificant) {
                return {
                  isBrilliant: true,
                  brilliantType: BrilliantMoveType.SACRIFICE,
                  reason: `Tactical trap! Taking the ${movedPiece.toUpperCase()} loses ${lossForTaking}cp`,
                  confidence: 95,
                };
              }
            }
            // 🔧 FIX: הסרנו את הבלוק שמסמן מבריק רק כי הלקיחה לא ב-topMoves!
            // זה היה הבאג - מהלך רגיל שהכלי מוגן לא צריך להיות מבריק
          }
        }
      }
    } catch {
      // שגיאה בניתוח
    }

    return this._notBrilliant('Not a tactical trap sacrifice');
  }

  /**
   * מצא תגובה טקטית אחרי שהיריב אוכל את הכלי
   * חיפוש: פורק, שח נגלה, שח עם איום, מט
   */
  private _findTacticalResponse(
    fenAfterMyMove: string,
    opponentCapture: any,
    isWhiteMove: boolean
  ): { hasResponse: boolean; type: string } {
    try {
      const chessAfterCapture = new Chess(fenAfterMyMove);
      chessAfterCapture.move(opponentCapture);

      const myResponses = chessAfterCapture.moves({ verbose: true });

      for (const response of myResponses) {
        const testChess = new Chess(chessAfterCapture.fen());
        testChess.move(response);

        // מט מיידי!
        if (testChess.isCheckmate()) {
          return { hasResponse: true, type: 'checkmate' };
        }

        // 🔧 FIX: שח שתוקף גם כלי יקר (פורק!) - זה הקלאסי של Qxd5!! Nxc7+
        if (testChess.isCheck()) {
          // בדוק אם הכלי שזז תוקף עכשיו כלי יקר (מלכה, צריח)
          const attackedByMovedPiece = this._getKnightAttacks(response.to);
          for (const sq of attackedByMovedPiece) {
            const pieceOnSq = testChess.get(sq as any);
            if (pieceOnSq) {
              const isEnemyPiece = isWhiteMove ? pieceOnSq.color === 'b' : pieceOnSq.color === 'w';
              if (isEnemyPiece) {
                const pieceValue = PIECE_VALUES[pieceOnSq.type as keyof typeof PIECE_VALUES] || 0;
                // אם תוקפים מלכה או צריח = פורק מבריק!
                if (pieceValue >= 500) {
                  return { hasResponse: true, type: `fork! Check + attacks ${pieceOnSq.type.toUpperCase()} (${pieceValue}cp)` };
                }
              }
            }
          }

          // גם שח שאוכל קצין+ הוא טוב
          if (response.captured) {
            const capturedValue = PIECE_VALUES[response.captured as keyof typeof PIECE_VALUES] || 0;
            if (capturedValue >= 300) {
              return { hasResponse: true, type: 'fork/discovered attack winning material' };
            }
          }
        }

        // פורק על מלכה/מלך (בלי שח) - בדוק אם המהלך תוקף מספר כלים
        if (response.piece === 'n' || response.piece === 'b' || response.piece === 'r') {
          const attackedPieces = this._getPiecesAttackedByKnight(testChess, response.to, !isWhiteMove);

          // פורק על שני כלים יקרים
          if (attackedPieces.length >= 2) {
            const totalValue = attackedPieces.reduce((sum, p) =>
              sum + (PIECE_VALUES[p as keyof typeof PIECE_VALUES] || 0), 0
            );
            if (totalValue >= 900) {
              return { hasResponse: true, type: 'fork on valuable pieces' };
            }
          }
        }
      }
    } catch (e) {
      // שגיאה
      console.error('[BrilliantDetector] Error in _findTacticalResponse:', e);
    }

    return { hasResponse: false, type: '' };
  }

  /**
   * 🔧 NEW: קבל משבצות שפרש תוקף (לא תלוי בתור!)
   */
  private _getKnightAttacks(square: string): string[] {
    const file = square.charCodeAt(0) - 97; // a=0, b=1, etc.
    const rank = parseInt(square[1]) - 1;   // 1=0, 2=1, etc.

    const knightMoves = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];

    const attacks: string[] = [];
    for (const [df, dr] of knightMoves) {
      const newFile = file + df;
      const newRank = rank + dr;
      if (newFile >= 0 && newFile <= 7 && newRank >= 0 && newRank <= 7) {
        attacks.push(String.fromCharCode(97 + newFile) + (newRank + 1));
      }
    }
    return attacks;
  }

  /**
   * 🔧 NEW: קבל כלי יריב שפרש תוקף
   */
  private _getPiecesAttackedByKnight(chess: Chess, square: string, forWhite: boolean): string[] {
    const attacks = this._getKnightAttacks(square);
    const pieces: string[] = [];

    for (const sq of attacks) {
      const piece = chess.get(sq as any);
      if (piece) {
        const isTargetColor = forWhite ? piece.color === 'w' : piece.color === 'b';
        if (isTargetColor) {
          pieces.push(piece.type);
        }
      }
    }
    return pieces;
  }

  /**
   * קבל משבצות שכלי תוקף (deprecated - use _getKnightAttacks)
   */
  private _getAttackedSquares(chess: Chess, square: string, piece: string): string[] {
    // For knights, use the new method
    if (piece === 'n') {
      return this._getKnightAttacks(square);
    }

    // Fallback for other pieces (less accurate)
    const attacked: string[] = [];
    const moves = chess.moves({ verbose: true, square: square as any });
    for (const move of moves) {
      if (move.captured) {
        attacked.push(move.to);
      }
    }
    return attacked;
  }

  /**
   * קבל כלים שנתקפים
   */
  private _getAttackedPieces(chess: Chess, squares: string[], forWhite: boolean): string[] {
    const pieces: string[] = [];

    for (const sq of squares) {
      const piece = chess.get(sq as any);
      if (piece) {
        const isWhitePiece = piece.color === 'w';
        if (isWhitePiece === forWhite) {
          pieces.push(piece.type);
        }
      }
    }

    return pieces;
  }

  /**
   * 🆕 בדיקת הקרבת מלכה עם מט מאולץ
   * מקרה קלאסי: Qg1+! - אם הצריח יאכל, יש מט. אם המלכה תאכל, השחקן מרוויח מלכה.
   *
   * הקריטריונים:
   * 1. המהלך הוא מהלך מלכה שנותן שח
   * 2. למלכה יש לפחות 2 תגובות אפשריות (כלומר לא מאולץ)
   * 3. לפחות תגובה אחת מובילה למט מיידי
   * 4. התגובה האחרת גורמת להפסד חומר משמעותי (מלכה)
   */
  private _checkQueenSacrificeWithMate(
    move: any,
    fenBefore: string,
    fenAfter: string,
    isWhiteMove: boolean,
    evalBefore: number
  ): BrilliantDetectionResult {
    // רק מהלכי מלכה
    if (move.piece !== 'q') {
      return this._notBrilliant('Not a queen move');
    }

    // 🔧 לא מבריק אם השחקן בעמדה מפסידה!
    const playerEval = isWhiteMove ? evalBefore : -evalBefore;
    if (playerEval < -200) {
      return this._notBrilliant('Player is in losing position');
    }

    // 🔧 לא מבריק אם כבר יש מט מאולץ לטובת השחקן
    const MATE_THRESHOLD = 97000;
    const iAlreadyHaveMate = isWhiteMove ? evalBefore >= MATE_THRESHOLD : evalBefore <= -MATE_THRESHOLD;
    if (iAlreadyHaveMate) {
      return this._notBrilliant('Already have forced mate');
    }

    try {
      const chessAfter = new Chess(fenAfter);

      // בדוק אם המהלך נתן שח
      if (!chessAfter.isCheck()) {
        return this._notBrilliant('Queen move does not give check');
      }

      // קבל את כל התגובות האפשריות ליריב
      const responses = chessAfter.moves({ verbose: true });

      // 🆕 מקרה מיוחד: אם יש רק תגובה אחת שהיא לקיחת המלכה,
      // ואחרי הלקיחה השחקן יכול לקחת בחזרה = combo מבריק!
      // דוגמא: Qg1+ Qxg1 Nxg1 - הקרבת מלכה שזוכה במלכה!
      if (responses.length === 1) {
        const response = responses[0];
        // בדוק אם התגובה היא לקיחת המלכה
        if (response.to === move.to && response.captured === 'q') {
          // בצע את הלקיחה ובדוק אם יש לקיחה חזרה
          const testChess = new Chess(fenAfter);
          testChess.move(response);

          const counterMoves = testChess.moves({ verbose: true });
          // בדוק אם יש מהלך שלוקח את הכלי שלקח את המלכה
          const recaptureMove = counterMoves.find((m: any) =>
            m.to === move.to && m.captured === response.piece
          );

          if (recaptureMove) {
            // זו הקרבת מלכה שמחזירה מלכה!
            return {
              isBrilliant: true,
              brilliantType: BrilliantMoveType.SACRIFICE,
              reason: 'Queen sacrifice forcing queen win!',
              confidence: 98,
            };
          }
        }

        return this._notBrilliant('Only one response - forced position');
      }

      // בדוק אם יש תגובה שמובילה למט מיידי
      let hasMateResponse = false;
      let hasSafeResponse = false;
      const movedToSquare = move.to;

      for (const response of responses) {
        // בצע את התגובה
        const testChess = new Chess(fenAfter);
        testChess.move(response);

        // קבל את התגובות של השחקן
        const counterMoves = testChess.moves({ verbose: true });

        // בדוק אם יש מט מיידי אחרי תגובה זו
        for (const counterMove of counterMoves) {
          const mateTestChess = new Chess(testChess.fen());
          mateTestChess.move(counterMove);

          if (mateTestChess.isCheckmate()) {
            // נמצא מט! בדוק אם זו תגובה של לקיחת המלכה
            if (response.to === movedToSquare && response.captured === 'q') {
              hasMateResponse = true;
            }
          }
        }

        // בדוק אם זו תגובה "בטוחה" (לקיחה עם המלכה)
        if (response.to === movedToSquare && response.piece === 'q' && response.captured === 'q') {
          hasSafeResponse = true;
        }
      }

      // אם יש תגובה שמובילה למט ויש גם תגובה בטוחה = הקרבה מבריקה!
      if (hasMateResponse && hasSafeResponse) {
        return {
          isBrilliant: true,
          brilliantType: BrilliantMoveType.SACRIFICE,
          reason: 'Queen sacrifice with forced mate if captured wrong!',
          confidence: 99,
        };
      }
    } catch {
      // שגיאה בניתוח
    }

    return this._notBrilliant('Not a queen sacrifice with mate');
  }
}
