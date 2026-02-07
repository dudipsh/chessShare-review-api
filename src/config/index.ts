/**
 * Environment configuration
 */

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  isProduction: process.env.NODE_ENV === 'production',

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',

  // Stockfish
  stockfishPath: process.env.STOCKFISH_PATH || '/usr/games/stockfish',
  stockfishPoolSize: parseInt(process.env.STOCKFISH_POOL_SIZE || '4', 10),
  stockfishDepth: parseInt(process.env.STOCKFISH_DEPTH || '18', 10),
  stockfishTimeout: parseInt(process.env.STOCKFISH_TIMEOUT || '10000', 10),

  // CORS
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:8080')
    .split(',')
    .map((o) => o.trim()),

  // Rate Limiting (PRO is unlimited - skipped in middleware)
  rateLimitFreeDaily: parseInt(process.env.RATE_LIMIT_FREE_DAILY || '1', 10),
  rateLimitBasicDaily: parseInt(process.env.RATE_LIMIT_BASIC_DAILY || '5', 10),
} as const;

export type Config = typeof config;

export function validateConfig(): void {
  const required = ['supabaseUrl', 'supabaseServiceKey'] as const;

  for (const key of required) {
    if (!config[key]) {
      console.warn(`Warning: ${key} is not set in environment variables`);
    }
  }
}
