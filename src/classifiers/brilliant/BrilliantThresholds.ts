/**
 * Brilliant Move Detection Thresholds
 * קונפיגורציה מרכזית לזיהוי מהלכים מבריקים
 */

export const BRILLIANT_THRESHOLDS = {
  // ===========================================
  // תנאי סף (MUST PASS) - מחמירים יותר!
  // ===========================================
  
  /** מקסימום centipawn loss מותר למהלך מבריק רגיל (🔧 raised for depth 12) */
  MAX_CP_LOSS: 25,

  /** מקסימום cpLoss להקרבה טקטית (מלכודת) - גמיש יותר! (🔧 raised for depth 12) */
  TACTICAL_TRAP_MAX_CP_LOSS: 60,

  /** מינימום שינוי בהערכה (eval swing) - מחמיר! */
  MIN_EVAL_SWING: 150,

  /** האם המהלך צריך להיות Best או קרוב מאוד */
  REQUIRE_BEST_OR_NEAR_BEST: true,

  /** מקסימום פער מ-best move (cp) (🔧 raised for depth 12) */
  MAX_GAP_FROM_BEST: 20,
  
  /** מינימום פער מהמהלך השני הטוב ביותר - המהלך חייב להיות הרבה יותר טוב מהאלטרנטיבות! */
  MIN_GAP_TO_SECOND_BEST: 100,
  
  // ===========================================
  // הקרבות (SACRIFICES)
  // ===========================================
  
  /** ערך מינימלי להקרבה (centipawns) - לפחות קצין! */
  MIN_SACRIFICE_VALUE: 300, // 3 pawns = קצין מינימום
  
  /** מקסימום תמורה מיידית (לא הקרבה אם מקבל יותר) */
  MAX_IMMEDIATE_RETURN: 100, // 1 pawn
  
  /** מינימום cp loss להיריב אם יאכל את הכלי התלוי - אם לקיחת הכלי היא טעות */
  MIN_OPPONENT_LOSS_FOR_TAKING: 100, // אם היריב מפסיד 1+ pawn על ידי לקיחה = הקרבה מבריקה!
  
  /** מלכה להקרבה */
  QUEEN_VALUE: 900,
  QUEEN_SAC_TO_MATE_MAX_MOVES: 8, // הקרבת מלכה → מט תוך 8 מהלכים
  QUEEN_SAC_MIN_COMPENSATION: 600, // או לפחות 6 pawns compensation
  
  /** צריח להקרבה */
  ROOK_VALUE: 500,
  ROOK_SAC_MIN_COMPENSATION: 400,
  
  /** קצין להקרבה */
  MINOR_PIECE_VALUE: 320,
  MINOR_SAC_MIN_COMPENSATION: 250,
  
  // ===========================================
  // Only Move (מהלך יחיד)
  // ===========================================
  
  /** מקסימום מהלכים "טובים" שיכולים להיות */
  MAX_GOOD_MOVES_FOR_ONLY: 2,
  
  /** מינימום הפרש CP בין המהלך הטוב ביותר לשני */
  MIN_GAP_FOR_ONLY_MOVE: 150,
  
  // ===========================================
  // Quiet Moves (מהלכים שקטים) - מבוטל!
  // ===========================================
  
  /** האם לאפשר מהלכים שקטים להיות brilliant - מבוטל! מבריק = הקרבה בלבד */
  ALLOW_QUIET_BRILLIANT: false,
  
  /** מינימום שינוי הערכה למהלך שקט */
  QUIET_MIN_EVAL_SWING: 500, // גבוה מאוד - למעשה מבוטל
  
  /** מהלך שקט צריך ליצור איום מרובה */
  QUIET_REQUIRES_MULTIPLE_THREATS: true,
  
  // ===========================================
  // Tactical Motifs (מוטיבים טקטיים)
  // ===========================================
  
  /** רשימת מוטיבים שמזכים ב-brilliant */
  TACTICAL_MOTIFS: {
    DEFLECTION: true,        // הסטה
    ZWISCHENZUG: true,       // מהלך ביניים
    X_RAY: true,             // X-Ray
    PIN_EXPLOITATION: true,  // ניצול תקיעה
    REMOVE_DEFENDER: true,   // הסרת מגן
    DISCOVERED_ATTACK: true, // התקפה נגלית
    DOUBLE_ATTACK: true,     // התקפה כפולה
  },
  
  // ===========================================
  // Anti-False-Positives (מניעת false positives) - מחמירים!
  // ===========================================
  
  /** האם לפסול חילופי מלכות אוטומטיים */
  REJECT_AUTOMATIC_QUEEN_TRADES: true,
  
  /** האם לפסול לקיחת כלי חינם (free piece) - כלי לא מוגן */
  REJECT_FREE_PIECES: true,
  
  /** האם לפסול טרייד רגיל שנראה כהקרבה */
  REJECT_REGULAR_TRADES: true,
  
  /** האם לפסול מהלכי book */
  REJECT_BOOK_MOVES: true,
  BOOK_MOVES_MAX_MOVE_NUMBER: 10,
  
  /** האם לפסול מהלך שעובד רק אם היריב טועה */
  REJECT_IF_BEST_DEFENSE_WINS: true,
  
  /** האם לפסול לקיחה פשוטה (capturing undefended piece) */
  REJECT_SIMPLE_CAPTURES: true,
  
  /** מקסימום cp loss של מהלכים אחרים כדי לפסול - אם יש מהלך אחר טוב = לא מבריק */
  MAX_ALTERNATIVE_LOSS_TO_REJECT: 80, // אם יש מהלך אחר עם פחות מ-80cp loss, אז לא מבריק
  
  // ===========================================
  // Analysis Settings (הגדרות ניתוח)
  // ===========================================
  
  /** עומק מינימלי לניתוח Stockfish (🔧 lowered for fast mode) */
  MIN_ANALYSIS_DEPTH: 12,
  
  /** timeout לניתוח (ms) */
  ANALYSIS_TIMEOUT: 5000,
  
  /** האם להשתמש ב-multi-PV לבדיקת variations */
  USE_MULTI_PV: true,
  MULTI_PV_LINES: 3,
  
} as const;

/**
 * ערכי כלים (piece values) בcentipawns
 */
export const PIECE_VALUES = {
  p: 100,   // Pawn
  n: 320,   // Knight
  b: 330,   // Bishop
  r: 500,   // Rook
  q: 900,   // Queen
  k: 20000, // King (לא רלוונטי להקרבות)
} as const;

/**
 * רמות brilliant (למקרה שנרצה gradations בעתיד)
 */
export enum BrilliantLevel {
  NOT_BRILLIANT = 0,
  BRILLIANT = 1,
  ULTRA_BRILLIANT = 2, // למט מהמם או הקרבה פנומנלית
}

/**
 * סוג ההקרבה
 */
export enum SacrificeType {
  NONE = 'none',
  QUEEN = 'queen',
  ROOK = 'rook',
  MINOR_PIECE = 'minor',
  PAWN = 'pawn',
  EXCHANGE = 'exchange', // quality sacrifice (rook for minor)
}

/**
 * סוג המהלך המבריק
 */
export enum BrilliantMoveType {
  SACRIFICE = 'sacrifice',
  QUIET_CRUSHING = 'quiet_crushing',
  ONLY_MOVE = 'only_move',
  TACTICAL_MOTIF = 'tactical_motif',
  ENDGAME_TECHNIQUE = 'endgame_technique',
}

