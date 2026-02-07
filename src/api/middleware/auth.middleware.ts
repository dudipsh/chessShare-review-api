/**
 * Authentication middleware - Validates Supabase JWT tokens
 */

import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { UserTier } from '../../types/index.js';

const authLogger = logger.child({ middleware: 'auth' });

// Create Supabase admin client
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    tier: UserTier;
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Skip auth in development mode for testing
    if (config.nodeEnv === 'development') {
      req.user = {
        id: 'dev-user',
        email: 'dev@test.com',
        tier: 'pro', // Give pro tier in dev mode for full testing
      };
      next();
      return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.slice(7);

    // Verify JWT token
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      authLogger.warn({ error: error?.message }, 'Invalid token');
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Get user's subscription tier
    const tier = await getUserTier(user.id);

    req.user = {
      id: user.id,
      email: user.email,
      tier,
    };

    next();
  } catch (error) {
    authLogger.error({ error }, 'Auth middleware error');
    res.status(500).json({ error: 'Authentication error' });
  }
}

async function getUserTier(userId: string): Promise<UserTier> {
  try {
    // Query user's subscription status from database
    const { data, error } = await supabase
      .from('profiles')
      .select('subscription_type')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return 'free';
    }

    if (data.subscription_type === 'PRO') return 'pro';
    if (data.subscription_type === 'BASIC') return 'basic';
    return 'free';
  } catch {
    return 'free';
  }
}

// Optional auth - doesn't fail if no token provided
export async function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    // No auth provided, continue without user
    next();
    return;
  }

  // Try to authenticate
  return authMiddleware(req, res, next);
}
