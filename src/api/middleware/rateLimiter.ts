/**
 * Rate limiter middleware - Limits requests based on user tier
 */

import { Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { AuthenticatedRequest } from './auth.middleware.js';
import { RateLimitInfo } from '../../types/index.js';

const rateLimitLogger = logger.child({ middleware: 'rateLimit' });

// Create Supabase admin client
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// In-memory cache for rate limit checks
const rateLimitCache = new Map<string, { count: number; resetAt: Date }>();

export async function rateLimiterMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required for this endpoint' });
      return;
    }

    const { id: userId, tier } = req.user;

    // PRO users have unlimited reviews
    if (tier === 'pro') {
      next();
      return;
    }

    const limit = tier === 'basic' ? config.rateLimitBasicDaily : config.rateLimitFreeDaily;

    // Check rate limit
    const rateLimitInfo = await checkRateLimit(userId, limit, tier);

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', rateLimitInfo.limit);
    res.setHeader('X-RateLimit-Remaining', rateLimitInfo.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimitInfo.resetAt.toISOString());

    if (rateLimitInfo.remaining <= 0) {
      rateLimitLogger.warn({ userId, tier, limit }, 'Rate limit exceeded');
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: `You have exceeded your daily limit of ${limit} reviews. Upgrade to unlock more reviews.`,
        resetAt: rateLimitInfo.resetAt.toISOString(),
      });
      return;
    }

    // Store rate limit info in request for later use
    (req as AuthenticatedRequest & { rateLimit: RateLimitInfo }).rateLimit = rateLimitInfo;

    next();
  } catch (error) {
    rateLimitLogger.error({ error }, 'Rate limiter error');
    // On error, allow the request (fail open)
    next();
  }
}

async function checkRateLimit(
  userId: string,
  limit: number,
  tier: RateLimitInfo['tier']
): Promise<RateLimitInfo> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Check cache first
  const cacheKey = `${userId}:${today.toISOString().split('T')[0]}`;
  const cached = rateLimitCache.get(cacheKey);

  if (cached && cached.resetAt > new Date()) {
    return {
      tier,
      remaining: Math.max(0, limit - cached.count),
      limit,
      resetAt: tomorrow,
    };
  }

  // Query database for today's review count
  try {
    const { count, error } = await supabase
      .from('game_review_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString());

    if (error) {
      rateLimitLogger.error({ error }, 'Error checking rate limit');
      // On error, return full limit (fail open)
      return {
        tier,
        remaining: limit,
        limit,
        resetAt: tomorrow,
      };
    }

    const currentCount = count || 0;

    // Update cache
    rateLimitCache.set(cacheKey, {
      count: currentCount,
      resetAt: tomorrow,
    });

    return {
      tier,
      remaining: Math.max(0, limit - currentCount),
      limit,
      resetAt: tomorrow,
    };
  } catch (error) {
    rateLimitLogger.error({ error }, 'Rate limit check failed');
    return {
      tier,
      remaining: limit,
      limit,
      resetAt: tomorrow,
    };
  }
}

// Increment rate limit counter after successful review
export async function incrementRateLimitCounter(userId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cacheKey = `${userId}:${today.toISOString().split('T')[0]}`;

  // Update cache
  const cached = rateLimitCache.get(cacheKey);
  if (cached) {
    cached.count++;
  }

  // Insert record into database
  try {
    await supabase.from('game_review_requests').insert({
      user_id: userId,
      status: 'completed',
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    rateLimitLogger.error({ error }, 'Failed to increment rate limit counter');
  }
}
