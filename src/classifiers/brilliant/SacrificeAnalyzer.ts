/**
 * SacrificeAnalyzer - זיהוי והערכת הקרבות
 * מטרה: לזהות הקרבות אמיתיות שמקבלות תמורה מוכחת
 * 
 * כולל זיהוי של:
 * 1. הקרבות ישירות (כלי יקר אוכל כלי זול יותר)
 * 2. כלי תלוי (hanging piece) שאם היריב יאכל = טעות
 */

import { Chess } from 'chess.js';
import { BRILLIANT_THRESHOLDS, PIECE_VALUES, SacrificeType } from './BrilliantThresholds.js';

export interface SacrificeResult {
  isSacrifice: boolean;
  sacrificeType: SacrificeType;
  sacrificeValue: number;        // כמה חומר ניתן
  immediateReturn: number;        // כמה חומר מתקבל מיד
  netSacrifice: number;          // sacrificeValue - immediateReturn
  hasCompensation: boolean;      // האם יש תמורה מספקת
  compensationType: 'mate' | 'material' | 'positional' | 'trap' | 'none';
  leadsToMate: boolean;
  mateIn: number | null;
  isHangingPieceSacrifice: boolean; // האם זו הקרבה של כלי תלוי
  takingIsMistake: boolean;         // האם לקיחת הכלי התלוי היא טעות
}

export class SacrificeAnalyzer {
  /**
   * ניתוח הקרבה - האם זו הקרבה אמיתית ומה התמורה
   */
  analyzeSacrifice(
    move: any,
    fenBefore: string,
    evalBefore: number,
    evalAfter: number,
    isWhiteMove: boolean,
    fenAfter?: string,
    topMovesAfter?: Array<{ uci: string; cp: number }>
  ): SacrificeResult {
    const chess = new Chess(fenBefore);
    
    // 1. בדוק אם יש כלי תלוי אחרי המהלך (הקרבה מסוג חדש!)
    const hangingResult = this._analyzeHangingPiece(
      move, fenBefore, fenAfter, evalAfter, isWhiteMove, topMovesAfter
    );
    
    if (hangingResult.isHangingPieceSacrifice && hangingResult.takingIsMistake) {
      return hangingResult;
    }
    
    // 2. חשב ערכי חומר (הקרבה ישירה)
    const { sacrificeValue, immediateReturn, sacrificeType } = 
      this._calculateMaterialExchange(move, chess);
    
    const netSacrifice = sacrificeValue - immediateReturn;
    
    // 3. בדוק אם זו באמת הקרבה ישירה
    const isSacrifice = this._isRealSacrifice(netSacrifice, immediateReturn);
    
    if (!isSacrifice) {
      return this._noSacrificeResult();
    }
    
    // 4. בדוק תמורה
    const compensation = this._analyzeCompensation(
      evalBefore,
      evalAfter,
      isWhiteMove,
      netSacrifice,
      sacrificeType
    );
    
    return {
      isSacrifice: true,
      sacrificeType,
      sacrificeValue,
      immediateReturn,
      netSacrifice,
      ...compensation,
      isHangingPieceSacrifice: false,
      takingIsMistake: false,
    };
  }
  
  /**
   * 🆕 ניתוח כלי תלוי - האם המהלך משאיר כלי תלוי שלקיחתו היא טעות?
   * זה המקרה של: "הקרבתי צריח, אם היריב יאכל זו טעות!"
   *
   * 🔧 תיקון v2: ההבדל בין מהלך אכילה למהלך רגיל:
   * - מהלך אכילה (כמו Rxe5+): הכלי שזז יכול להילקח בחזרה = הקרבה אפשרית
   * - מהלך רגיל (כמו Bh6): הכלי שזז יכול להילקח = לא הקרבה, פשוט מלכודת
   */
  private _analyzeHangingPiece(
    move: any,
    fenBefore: string,
    fenAfter: string | undefined,
    evalAfter: number,
    isWhiteMove: boolean,
    topMovesAfter?: Array<{ uci: string; cp: number }>
  ): SacrificeResult {
    if (!fenAfter) {
      return this._noSacrificeResult();
    }

    try {
      const chessAfter = new Chess(fenAfter);
      const playerColor = isWhiteMove ? 'w' : 'b';
      const opponentColor = isWhiteMove ? 'b' : 'w';

      // 🔧 תיקון: קבל את המשבצת שהכלי זז אליה והאם זה מהלך אכילה
      const movedToSquare = move.to;
      const isCapture = !!move.captured;

      // מצא את כל הכלים שלי שהיריב יכול לאכול
      const opponentMoves = chessAfter.moves({ verbose: true });
      const captureMoves = opponentMoves.filter(m => m.captured);

      // מצא אם יש כלי תלוי משמעותי
      for (const captureMove of captureMoves) {
        // 🔧 תיקון v2:
        // - אם זה מהלך NON-CAPTURE: דלג על לקיחת הכלי שזז (זה לא הקרבה)
        // - אם זה מהלך CAPTURE: הכלי שזז יכול להיחשב כהקרבה (כמו Rxe5+)
        if (!isCapture && captureMove.to === movedToSquare) {
          continue;
        }

        const capturedValue = PIECE_VALUES[captureMove.captured as keyof typeof PIECE_VALUES] || 0;

        // רק כלים בעלי ערך משמעותי (לפחות קצין)
        if (capturedValue < BRILLIANT_THRESHOLDS.MIN_SACRIFICE_VALUE) {
          continue;
        }

        // בדוק אם לקיחת הכלי הזה היא טעות של היריב
        const takingIsMistake = this._isTakingAMistake(
          captureMove, chessAfter, fenAfter, evalAfter, isWhiteMove, topMovesAfter
        );

        if (takingIsMistake) {
          // 🎯 זו הקרבה מבריקה! המהלך השאיר כלי תלוי שלקיחתו = טעות
          return {
            isSacrifice: true,
            sacrificeType: this._getSacrificeTypeByPiece(captureMove.captured || 'p'),
            sacrificeValue: capturedValue,
            immediateReturn: 0, // היריב לא אכל עדיין
            netSacrifice: capturedValue,
            hasCompensation: true,
            compensationType: 'trap',
            leadsToMate: this._checkIfLeadsToMate(evalAfter, isWhiteMove),
            mateIn: this._getMateIn(evalAfter, isWhiteMove),
            isHangingPieceSacrifice: true,
            takingIsMistake: true,
          };
        }
      }
    } catch (e) {
      // שגיאה בניתוח - החזר תוצאה ריקה
    }

    return this._noSacrificeResult();
  }
  
  /**
   * בדיקה אם לקיחת הכלי התלוי היא טעות של היריב
   */
  private _isTakingAMistake(
    captureMove: any,
    chessAfter: Chess,
    fenAfter: string,
    evalAfter: number,
    isWhiteMove: boolean,
    topMovesAfter?: Array<{ uci: string; cp: number }>
  ): boolean {
    const captureUci = captureMove.from + captureMove.to;

    // שיטה 1: בדוק את topMoves - אם הלקיחה לא בין המהלכים הטובים ביותר
    if (topMovesAfter && topMovesAfter.length > 0) {
      const bestMoveUci = topMovesAfter[0]?.uci?.toLowerCase();

      // אם הלקיחה היא המהלך הטוב ביותר - זו לא הקרבה
      if (captureUci.toLowerCase() === bestMoveUci) {
        return false;
      }

      // בדוק אם הלקיחה בכלל בין ה-topMoves
      const captureInTopMoves = topMovesAfter.find(
        tm => tm.uci.toLowerCase() === captureUci.toLowerCase()
      );

      if (captureInTopMoves) {
        // חשב כמה היריב מפסיד אם יאכל
        const bestEval = topMovesAfter[0].cp;
        const captureEval = captureInTopMoves.cp;
        const lossForTaking = Math.abs(bestEval - captureEval);

        // אם היריב מפסיד מספיק על הלקיחה - זו הקרבה מבריקה!
        if (lossForTaking >= BRILLIANT_THRESHOLDS.MIN_OPPONENT_LOSS_FOR_TAKING) {
          return true;
        }
      } else {
        // הלקיחה בכלל לא ב-topMoves - כנראה טעות גדולה!
        return true;
      }
    }

    // שיטה 2: בדוק eval - אם אחרי המהלך ההערכה מאוד לטובת השחקן
    const WINNING_THRESHOLD = 300; // 3 pawns
    const playerEval = isWhiteMove ? evalAfter : -evalAfter;

    // אם אחרי המהלך השחקן מנצח בבירור - כנראה הלקיחה תהיה טעות
    if (playerEval >= WINNING_THRESHOLD) {
      return true;
    }

    // בדיקת מט
    if (this._checkIfLeadsToMate(evalAfter, isWhiteMove)) {
      return true;
    }

    return false;
  }
  
  /**
   * קבלת סוג ההקרבה לפי סוג הכלי
   */
  private _getSacrificeTypeByPiece(piece: string): SacrificeType {
    switch (piece) {
      case 'q': return SacrificeType.QUEEN;
      case 'r': return SacrificeType.ROOK;
      case 'n': 
      case 'b': return SacrificeType.MINOR_PIECE;
      case 'p': return SacrificeType.PAWN;
      default: return SacrificeType.NONE;
    }
  }
  
  /**
   * בדיקה אם מוביל למט
   */
  private _checkIfLeadsToMate(evalAfter: number, isWhiteMove: boolean): boolean {
    const MATE_THRESHOLD = 97000;
    if (Math.abs(evalAfter) >= MATE_THRESHOLD) {
      return isWhiteMove ? evalAfter > 0 : evalAfter < 0;
    }
    return false;
  }
  
  /**
   * קבלת מספר מהלכים למט
   */
  private _getMateIn(evalAfter: number, isWhiteMove: boolean): number | null {
    const MATE_THRESHOLD = 97000;
    if (Math.abs(evalAfter) >= MATE_THRESHOLD) {
      const isMateForPlayer = isWhiteMove ? evalAfter > 0 : evalAfter < 0;
      if (isMateForPlayer) {
        return Math.round((100000 - Math.abs(evalAfter)) / 100);
      }
    }
    return null;
  }
  
  /**
   * חישוב חילוף חומר (הקרבה ישירה)
   */
  private _calculateMaterialExchange(move: any, chess: Chess): {
    sacrificeValue: number;
    immediateReturn: number;
    sacrificeType: SacrificeType;
  } {
    const movedPiece = move.piece;
    const capturedPiece = move.captured;
    
    const sacrificeValue = PIECE_VALUES[movedPiece as keyof typeof PIECE_VALUES] || 0;
    const immediateReturn = PIECE_VALUES[capturedPiece as keyof typeof PIECE_VALUES] || 0;
    
    // זיהוי סוג ההקרבה
    let sacrificeType = SacrificeType.NONE;
    if (sacrificeValue > immediateReturn + BRILLIANT_THRESHOLDS.MAX_IMMEDIATE_RETURN) {
      if (movedPiece === 'q') sacrificeType = SacrificeType.QUEEN;
      else if (movedPiece === 'r') sacrificeType = SacrificeType.ROOK;
      else if (movedPiece === 'n' || movedPiece === 'b') sacrificeType = SacrificeType.MINOR_PIECE;
      else if (movedPiece === 'p') sacrificeType = SacrificeType.PAWN;
    }
    
    return { sacrificeValue, immediateReturn, sacrificeType };
  }
  
  /**
   * בדיקה אם זו הקרבה אמיתית (ישירה)
   */
  private _isRealSacrifice(netSacrifice: number, immediateReturn: number): boolean {
    // צריך לתת יותר מ-MIN_SACRIFICE_VALUE
    if (netSacrifice < BRILLIANT_THRESHOLDS.MIN_SACRIFICE_VALUE) {
      return false;
    }
    
    // לא מקבל יותר מ-MAX_IMMEDIATE_RETURN מיד
    if (immediateReturn > BRILLIANT_THRESHOLDS.MAX_IMMEDIATE_RETURN) {
      return false;
    }
    
    return true;
  }
  
  /**
   * ניתוח תמורה להקרבה
   */
  private _analyzeCompensation(
    evalBefore: number,
    evalAfter: number,
    isWhiteMove: boolean,
    netSacrifice: number,
    sacrificeType: SacrificeType
  ): {
    hasCompensation: boolean;
    compensationType: 'mate' | 'material' | 'positional' | 'trap' | 'none';
    leadsToMate: boolean;
    mateIn: number | null;
  } {
    // 1. בדוק אם מוביל למט
    const mateInfo = this._checkMateCompensation(evalAfter, isWhiteMove);
    if (mateInfo.leadsToMate) {
      return {
        hasCompensation: true,
        compensationType: 'mate',
        ...mateInfo,
      };
    }
    
    // 2. בדוק שינוי הערכה (material/positional compensation)
    const evalSwing = this._calculateEvalSwing(evalBefore, evalAfter, isWhiteMove);
    
    // ⚠️ CRITICAL: evalSwing חייב להיות חיובי (שיפור) ולא שלילי (החמרה)!
    if (evalSwing < 0) {
      return {
        hasCompensation: false,
        compensationType: 'none',
        leadsToMate: false,
        mateIn: null,
      };
    }
    
    // לפי סוג ההקרבה
    const requiredCompensation = this._getRequiredCompensation(sacrificeType);
    
    if (evalSwing >= requiredCompensation) {
      return {
        hasCompensation: true,
        compensationType: evalSwing >= netSacrifice ? 'material' : 'positional',
        leadsToMate: false,
        mateIn: null,
      };
    }
    
    // אין תמורה מספקת
    return {
      hasCompensation: false,
      compensationType: 'none',
      leadsToMate: false,
      mateIn: null,
    };
  }
  
  /**
   * בדיקת מט
   */
  private _checkMateCompensation(evalAfter: number, isWhiteMove: boolean): {
    leadsToMate: boolean;
    mateIn: number | null;
  } {
    const MATE_THRESHOLD = 97000;
    
    if (Math.abs(evalAfter) >= MATE_THRESHOLD) {
      const mateValue = Math.abs(evalAfter);
      const mateIn = Math.round((100000 - mateValue) / 100);
      
      const isMateForPlayer = isWhiteMove ? evalAfter > 0 : evalAfter < 0;
      
      if (isMateForPlayer && mateIn <= BRILLIANT_THRESHOLDS.QUEEN_SAC_TO_MATE_MAX_MOVES) {
        return { leadsToMate: true, mateIn };
      }
    }
    
    return { leadsToMate: false, mateIn: null };
  }
  
  /**
   * חישוב שינוי הערכה מנקודת מבט השחקן
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
   * תמורה נדרשת לפי סוג ההקרבה
   */
  private _getRequiredCompensation(sacrificeType: SacrificeType): number {
    switch (sacrificeType) {
      case SacrificeType.QUEEN:
        return BRILLIANT_THRESHOLDS.QUEEN_SAC_MIN_COMPENSATION;
      case SacrificeType.ROOK:
        return BRILLIANT_THRESHOLDS.ROOK_SAC_MIN_COMPENSATION;
      case SacrificeType.MINOR_PIECE:
        return BRILLIANT_THRESHOLDS.MINOR_SAC_MIN_COMPENSATION;
      case SacrificeType.EXCHANGE:
        return 200; // איכות
      default:
        return BRILLIANT_THRESHOLDS.MIN_SACRIFICE_VALUE;
    }
  }
  
  /**
   * תוצאה ריקה (לא הקרבה)
   */
  private _noSacrificeResult(): SacrificeResult {
    return {
      isSacrifice: false,
      sacrificeType: SacrificeType.NONE,
      sacrificeValue: 0,
      immediateReturn: 0,
      netSacrifice: 0,
      hasCompensation: false,
      compensationType: 'none',
      leadsToMate: false,
      mateIn: null,
      isHangingPieceSacrifice: false,
      takingIsMistake: false,
    };
  }
}
