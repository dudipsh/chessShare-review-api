/**
 * StockfishPool - Manages a pool of Stockfish workers for parallel analysis
 */

import { StockfishWorker } from './StockfishWorker.js';
import { StockfishAnalysis } from '../types/index.js';
import { PARALLEL_ANALYSIS_CONFIG } from '../config/constants.js';

interface AnalysisRequest {
  fen: string;
  depth?: number;
  timeout?: number;
  resolve: (result: StockfishAnalysis) => void;
  reject: (error: Error) => void;
}

export class StockfishPool {
  private workers: StockfishWorker[] = [];
  private queue: AnalysisRequest[] = [];
  private readonly poolSize: number;
  private readonly stockfishPath: string;
  private isInitialized: boolean = false;
  private activeAnalyses: number = 0;

  constructor(poolSize?: number, stockfishPath?: string) {
    this.poolSize = poolSize || PARALLEL_ANALYSIS_CONFIG.NUM_WORKERS;
    this.stockfishPath = stockfishPath || process.env.STOCKFISH_PATH || '/usr/games/stockfish';
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  get active(): number {
    return this.activeAnalyses;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get workerCount(): number {
    return this.workers.length;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log(`[StockfishPool] Initializing ${this.poolSize} workers...`);

    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new StockfishWorker(i, this.stockfishPath);
      this.workers.push(worker);
      initPromises.push(worker.initialize());
    }

    await Promise.all(initPromises);

    this.isInitialized = true;
    console.log(`[StockfishPool] All ${this.poolSize} workers ready`);
  }

  async analyzePosition(
    fen: string,
    options: { depth?: number; timeout?: number } = {}
  ): Promise<StockfishAnalysis> {
    if (!this.isInitialized) {
      throw new Error('StockfishPool is not initialized');
    }

    return new Promise((resolve, reject) => {
      const request: AnalysisRequest = {
        fen,
        depth: options.depth,
        timeout: options.timeout,
        resolve,
        reject,
      };

      // Try to find an available worker
      const availableWorker = this.getAvailableWorker();

      if (availableWorker) {
        this.processRequest(availableWorker, request);
      } else {
        // Queue the request
        this.queue.push(request);
      }
    });
  }

  async analyzeBatch(
    positions: Array<{ fen: string; depth?: number }>,
    onProgress?: (index: number, total: number) => void
  ): Promise<StockfishAnalysis[]> {
    const results: StockfishAnalysis[] = new Array(positions.length);
    let completed = 0;

    await Promise.all(
      positions.map(async (pos, index) => {
        const result = await this.analyzePosition(pos.fen, { depth: pos.depth });
        results[index] = result;
        completed++;
        onProgress?.(completed, positions.length);
      })
    );

    return results;
  }

  private getAvailableWorker(): StockfishWorker | null {
    return this.workers.find((w) => w.ready) || null;
  }

  private async processRequest(
    worker: StockfishWorker,
    request: AnalysisRequest
  ): Promise<void> {
    this.activeAnalyses++;

    try {
      const result = await worker.analyze(request.fen, {
        depth: request.depth,
        timeout: request.timeout,
      });

      request.resolve(result);
    } catch (error) {
      request.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.activeAnalyses--;

      // Process next queued request
      this.processNextInQueue(worker);
    }
  }

  private processNextInQueue(worker: StockfishWorker): void {
    if (this.queue.length > 0 && worker.ready) {
      const nextRequest = this.queue.shift();
      if (nextRequest) {
        this.processRequest(worker, nextRequest);
      }
    }
  }

  stopAll(): void {
    for (const worker of this.workers) {
      worker.stop();
    }
  }

  async dispose(): Promise<void> {
    console.log('[StockfishPool] Disposing all workers...');

    // Reject all queued requests
    for (const request of this.queue) {
      request.reject(new Error('Pool is being disposed'));
    }
    this.queue = [];

    // Dispose all workers
    await Promise.all(this.workers.map((w) => w.dispose()));

    this.workers = [];
    this.isInitialized = false;

    console.log('[StockfishPool] All workers disposed');
  }

  getStatus(): {
    initialized: boolean;
    workerCount: number;
    activeAnalyses: number;
    queueLength: number;
    workers: Array<{ id: number; ready: boolean; busy: boolean }>;
  } {
    return {
      initialized: this.isInitialized,
      workerCount: this.workers.length,
      activeAnalyses: this.activeAnalyses,
      queueLength: this.queue.length,
      workers: this.workers.map((w) => ({
        id: w.workerId,
        ready: w.ready,
        busy: w.busy,
      })),
    };
  }
}

// Singleton instance for global access
let globalPool: StockfishPool | null = null;

export function getStockfishPool(): StockfishPool {
  if (!globalPool) {
    globalPool = new StockfishPool();
  }
  return globalPool;
}

export async function initializeStockfishPool(): Promise<StockfishPool> {
  const pool = getStockfishPool();
  await pool.initialize();
  return pool;
}

export async function disposeStockfishPool(): Promise<void> {
  if (globalPool) {
    await globalPool.dispose();
    globalPool = null;
  }
}
