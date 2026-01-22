/**
 * Classification Debug Logger
 * Logs detailed classification information for debugging
 */

import * as fs from 'fs';

const LOG_FILE = '/tmp/classification_debug.log';

export function classificationLog(message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logLine);
}

export function logMoveClassification(data: {
  moveNumber?: number;
  move: string;
  evalBefore: number;
  evalAfter: number;
  centipawnLoss: number;
  markerType: string;
  isBrilliantCheck?: boolean;
  brilliantReason?: string;
}): void {
  const line = `Move ${data.moveNumber || '?'}: ${data.move} | evalBefore=${data.evalBefore} evalAfter=${data.evalAfter} cpLoss=${data.centipawnLoss} | RESULT=${data.markerType}${data.isBrilliantCheck ? ` | Brilliant: ${data.brilliantReason || 'no'}` : ''}`;
  classificationLog(line);
}

export function clearClassificationLog(): void {
  try {
    fs.writeFileSync(LOG_FILE, '');
  } catch {
    // Ignore
  }
}
