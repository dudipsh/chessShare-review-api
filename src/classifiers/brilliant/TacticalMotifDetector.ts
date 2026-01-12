/**
 * TacticalMotifDetector - זיהוי מוטיבים טקטיים מתקדמים
 * מטרה: לזהות Zwischenzug, deflection, X-ray, וכו'
 */

import { Chess } from 'chess.js';
import { BRILLIANT_THRESHOLDS } from './BrilliantThresholds.js';

export interface TacticalMotif {
  type: string;
  detected: boolean;
  description: string;
}

export class TacticalMotifDetector {
  /**
   * זיהוי כל המוטיבים הטקטיים במהלך
   */
  detectMotifs(
    move: any,
    fenBefore: string,
    fenAfter: string
  ): TacticalMotif[] {
    const motifs: TacticalMotif[] = [];
    
    if (!BRILLIANT_THRESHOLDS.TACTICAL_MOTIFS) {
      return motifs;
    }
    
    // בדוק כל מוטיב
    if (BRILLIANT_THRESHOLDS.TACTICAL_MOTIFS.DEFLECTION) {
      motifs.push(this._checkDeflection(move, fenBefore, fenAfter));
    }
    
    if (BRILLIANT_THRESHOLDS.TACTICAL_MOTIFS.ZWISCHENZUG) {
      motifs.push(this._checkZwischenzug(move, fenBefore, fenAfter));
    }
    
    if (BRILLIANT_THRESHOLDS.TACTICAL_MOTIFS.X_RAY) {
      motifs.push(this._checkXRay(move, fenBefore, fenAfter));
    }
    
    if (BRILLIANT_THRESHOLDS.TACTICAL_MOTIFS.PIN_EXPLOITATION) {
      motifs.push(this._checkPinExploitation(move, fenBefore, fenAfter));
    }
    
    if (BRILLIANT_THRESHOLDS.TACTICAL_MOTIFS.REMOVE_DEFENDER) {
      motifs.push(this._checkRemoveDefender(move, fenBefore, fenAfter));
    }
    
    if (BRILLIANT_THRESHOLDS.TACTICAL_MOTIFS.DISCOVERED_ATTACK) {
      motifs.push(this._checkDiscoveredAttack(move, fenBefore, fenAfter));
    }
    
    if (BRILLIANT_THRESHOLDS.TACTICAL_MOTIFS.DOUBLE_ATTACK) {
      motifs.push(this._checkDoubleAttack(move, fenBefore, fenAfter));
    }
    
    return motifs.filter(m => m.detected);
  }
  
  /**
   * הסטה (Deflection)
   */
  private _checkDeflection(move: any, fenBefore: string, fenAfter: string): TacticalMotif {
    // זיהוי פשוט: האם כלי יריב נאלץ לעזוב עמדה חשובה
    return {
      type: 'DEFLECTION',
      detected: false, // TODO: implement
      description: 'Deflection - forcing a piece away from key square',
    };
  }
  
  /**
   * מהלך ביניים (Zwischenzug)
   */
  private _checkZwischenzug(move: any, fenBefore: string, fenAfter: string): TacticalMotif {
    // זיהוי: מהלך "בלתי צפוי" במקום הרצף "הצפוי"
    return {
      type: 'ZWISCHENZUG',
      detected: false, // TODO: implement
      description: 'In-between move - unexpected intermediate move',
    };
  }
  
  /**
   * X-Ray
   */
  private _checkXRay(move: any, fenBefore: string, fenAfter: string): TacticalMotif {
    // זיהוי: התקפה דרך כלי
    return {
      type: 'X_RAY',
      detected: false, // TODO: implement
      description: 'X-Ray attack through a piece',
    };
  }
  
  /**
   * ניצול תקיעה (Pin Exploitation)
   */
  private _checkPinExploitation(move: any, fenBefore: string, fenAfter: string): TacticalMotif {
    try {
      const chessAfter = new Chess(fenAfter);
      // בדוק אם יש כלי תקוע אצל היריב
      // TODO: implement proper pin detection
      return {
        type: 'PIN_EXPLOITATION',
        detected: false,
        description: 'Exploiting a pinned piece',
      };
    } catch {
      return { type: 'PIN_EXPLOITATION', detected: false, description: '' };
    }
  }
  
  /**
   * הסרת מגן (Remove the Defender)
   */
  private _checkRemoveDefender(move: any, fenBefore: string, fenAfter: string): TacticalMotif {
    // זיהוי: לקיחה/הסטה של כלי שמגן על משהו חשוב
    const isCapture = move.captured;
    
    if (isCapture) {
      return {
        type: 'REMOVE_DEFENDER',
        detected: true, // פשטני - כל לקיחה יכולה להיות הסרת מגן
        description: 'Removing the defender',
      };
    }
    
    return { type: 'REMOVE_DEFENDER', detected: false, description: '' };
  }
  
  /**
   * התקפה נגלית (Discovered Attack)
   */
  private _checkDiscoveredAttack(move: any, fenBefore: string, fenAfter: string): TacticalMotif {
    // זיהוי: מהלך שחושף התקפה מכלי אחר
    return {
      type: 'DISCOVERED_ATTACK',
      detected: false, // TODO: implement
      description: 'Discovered attack',
    };
  }
  
  /**
   * התקפה כפולה (Double Attack / Fork)
   */
  private _checkDoubleAttack(move: any, fenBefore: string, fenAfter: string): TacticalMotif {
    try {
      const chessAfter = new Chess(fenAfter);
      const moves = chessAfter.moves({ verbose: true }) as any[];
      
      // ספור איומים מהכלי שזז
      const threatsFromMovedPiece = moves.filter((m: any) => 
        m.from === move.to && (m.captured || this._givesCheck(fenAfter, m))
      );
      
      if (threatsFromMovedPiece.length >= 2) {
        return {
          type: 'DOUBLE_ATTACK',
          detected: true,
          description: 'Double attack / Fork',
        };
      }
      
    } catch {}
    
    return { type: 'DOUBLE_ATTACK', detected: false, description: '' };
  }
  
  /**
   * בדיקה אם מהלך נותן שח
   */
  private _givesCheck(fen: string, move: any): boolean {
    try {
      const chess = new Chess(fen);
      chess.move(move);
      return chess.isCheck();
    } catch {
      return false;
    }
  }
}

