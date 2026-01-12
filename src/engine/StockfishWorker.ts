/**
 * StockfishWorker - Wraps a single native Stockfish process
 * Handles UCI protocol communication
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { StockfishAnalysis } from '../types/index.js';
import { PARALLEL_ANALYSIS_CONFIG } from '../config/constants.js';

interface AnalysisOptions {
  depth?: number;
  movetime?: number;
  timeout?: number;
}

interface PVLine {
  uci: string;
  cp: number;
  depth: number;
  pv: string[];
}

export class StockfishWorker extends EventEmitter {
  private process: ChildProcess | null = null;
  private isReady: boolean = false;
  private isBusy: boolean = false;
  private readonly id: number;
  private readonly stockfishPath: string;
  private outputBuffer: string = '';
  private currentResolve: ((result: StockfishAnalysis) => void) | null = null;
  private currentReject: ((error: Error) => void) | null = null;
  private currentTimeout: NodeJS.Timeout | null = null;
  private pvLines: Map<number, PVLine> = new Map();
  private bestMove: string = '';
  private currentDepth: number = 0;

  constructor(id: number, stockfishPath?: string) {
    super();
    this.id = id;
    this.stockfishPath = stockfishPath || process.env.STOCKFISH_PATH || '/usr/games/stockfish';
  }

  get workerId(): number {
    return this.id;
  }

  get ready(): boolean {
    return this.isReady && !this.isBusy;
  }

  get busy(): boolean {
    return this.isBusy;
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.stockfishPath, [], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        if (!this.process.stdout || !this.process.stdin) {
          reject(new Error('Failed to create Stockfish process streams'));
          return;
        }

        let uciReceived = false;
        let outputBuffer = '';

        const initTimeout = setTimeout(() => {
          reject(new Error(`Stockfish ${this.id} initialization timeout`));
        }, 10000);

        // Set up output handler BEFORE sending any commands
        this.process.stdout.setEncoding('utf8');
        this.process.stdout.on('data', (data: string) => {
          outputBuffer += data;

          // Check for uciok during initialization
          if (!uciReceived && outputBuffer.includes('uciok')) {
            uciReceived = true;
            clearTimeout(initTimeout);
            this.configureEngine()
              .then(() => {
                this.isReady = true;
                console.log(`[Stockfish ${this.id}] Initialized successfully`);
                resolve();
              })
              .catch((err) => {
                console.error(`[Stockfish ${this.id}] Config error:`, err);
                reject(err);
              });
          }

          // After initialization, use normal handler
          if (uciReceived) {
            this.handleOutput(data);
          }
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          console.error(`[Stockfish ${this.id}] stderr:`, data.toString());
        });

        this.process.on('error', (err) => {
          console.error(`[Stockfish ${this.id}] Process error:`, err);
          clearTimeout(initTimeout);
          this.isReady = false;
          this.emit('error', err);
          reject(err);
        });

        this.process.on('close', (code) => {
          console.log(`[Stockfish ${this.id}] Process closed with code ${code}`);
          this.isReady = false;
          this.emit('close', code);
        });

        // Now send UCI command
        this.sendCommand('uci');
      } catch (err) {
        reject(err);
      }
    });
  }

  private async configureEngine(): Promise<void> {
    const hashSize = PARALLEL_ANALYSIS_CONFIG.HASH_SIZE_PER_WORKER;
    const threads = PARALLEL_ANALYSIS_CONFIG.THREADS_PER_WORKER;

    this.sendCommand(`setoption name Hash value ${hashSize}`);
    this.sendCommand(`setoption name Threads value ${threads}`);
    this.sendCommand('setoption name MultiPV value 3');

    // Wait for readyok - the output handler is already set up
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeListener('output', checkReady);
        reject(new Error(`Engine ${this.id} configuration timeout`));
      }, 5000);

      const checkReady = (data: string) => {
        if (data.includes('readyok')) {
          clearTimeout(timeout);
          this.removeListener('output', checkReady);
          resolve();
        }
      };

      // Set up listener BEFORE sending command
      this.on('output', checkReady);
      this.sendCommand('isready');
    });
  }

  private handleOutput(data: string): void {
    this.outputBuffer += data;
    const lines = this.outputBuffer.split('\n');

    // Keep incomplete line in buffer
    this.outputBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      this.emit('output', line);
      this.parseLine(line);
    }
  }

  private parseLine(line: string): void {
    // Parse info lines with PV
    if (line.startsWith('info') && line.includes(' pv ')) {
      const pvMatch = line.match(/multipv (\d+)/);
      const depthMatch = line.match(/depth (\d+)/);
      const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
      const pvMovesMatch = line.match(/ pv (.+)$/);

      if (pvMatch && depthMatch && scoreMatch && pvMovesMatch) {
        const pvIndex = parseInt(pvMatch[1], 10);
        const depth = parseInt(depthMatch[1], 10);
        const scoreType = scoreMatch[1];
        const scoreValue = parseInt(scoreMatch[2], 10);

        // Convert mate score to centipawns (large value)
        const cp = scoreType === 'mate'
          ? (scoreValue > 0 ? 100000 - scoreValue * 100 : -100000 - scoreValue * 100)
          : scoreValue;

        const pvMoves = pvMovesMatch[1].trim().split(' ');

        this.pvLines.set(pvIndex, {
          uci: pvMoves[0],
          cp,
          depth,
          pv: pvMoves,
        });

        this.currentDepth = Math.max(this.currentDepth, depth);
      }
    }

    // Parse bestmove
    if (line.startsWith('bestmove')) {
      const moveMatch = line.match(/bestmove (\S+)/);
      if (moveMatch) {
        this.bestMove = moveMatch[1];
        this.completeAnalysis();
      }
    }
  }

  private completeAnalysis(): void {
    if (!this.currentResolve) return;

    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }

    // Get evaluation from best PV line
    const topPV = this.pvLines.get(1);
    const evaluation = topPV?.cp ?? 0;

    // Build top moves array
    const topMoves: Array<{ uci: string; cp: number }> = [];
    for (let i = 1; i <= 3; i++) {
      const pv = this.pvLines.get(i);
      if (pv) {
        topMoves.push({ uci: pv.uci, cp: pv.cp });
      }
    }

    const result: StockfishAnalysis = {
      evaluation,
      bestMove: this.bestMove || topMoves[0]?.uci || '',
      topMoves,
      depth: this.currentDepth,
    };

    this.isBusy = false;
    this.currentResolve(result);
    this.currentResolve = null;
    this.currentReject = null;
  }

  async analyze(fen: string, options: AnalysisOptions = {}): Promise<StockfishAnalysis> {
    if (!this.isReady) {
      throw new Error(`Stockfish worker ${this.id} is not ready`);
    }

    if (this.isBusy) {
      throw new Error(`Stockfish worker ${this.id} is busy`);
    }

    this.isBusy = true;
    this.pvLines.clear();
    this.bestMove = '';
    this.currentDepth = 0;

    return new Promise((resolve, reject) => {
      this.currentResolve = resolve;
      this.currentReject = reject;

      const timeout = options.timeout || 10000;

      this.currentTimeout = setTimeout(() => {
        this.stop();
        this.isBusy = false;
        reject(new Error(`Analysis timeout after ${timeout}ms`));
        this.currentResolve = null;
        this.currentReject = null;
      }, timeout);

      // Set position
      this.sendCommand(`position fen ${fen}`);

      // Start analysis
      if (options.depth) {
        this.sendCommand(`go depth ${options.depth}`);
      } else if (options.movetime) {
        this.sendCommand(`go movetime ${options.movetime}`);
      } else {
        this.sendCommand('go depth 18');
      }
    });
  }

  stop(): void {
    if (this.process?.stdin) {
      this.sendCommand('stop');
    }
  }

  private sendCommand(command: string): void {
    if (this.process?.stdin && !this.process.stdin.destroyed) {
      this.process.stdin.write(`${command}\n`);
    }
  }

  async dispose(): Promise<void> {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
    }

    if (this.process) {
      this.sendCommand('quit');

      return new Promise((resolve) => {
        const forceKill = setTimeout(() => {
          this.process?.kill('SIGKILL');
          resolve();
        }, 2000);

        this.process?.on('close', () => {
          clearTimeout(forceKill);
          resolve();
        });
      });
    }
  }
}
