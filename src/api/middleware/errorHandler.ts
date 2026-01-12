/**
 * Global error handler middleware
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';

const errorLogger = logger.child({ middleware: 'errorHandler' });

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  errorLogger.error(
    {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      code: err.code,
    },
    'Request error'
  );

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Handle known errors with status codes
  if (err.statusCode) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code || 'ERROR',
      ...(config.isProduction ? {} : { details: err.details }),
    });
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    error: config.isProduction ? 'Internal server error' : err.message,
    code: 'INTERNAL_ERROR',
    ...(config.isProduction ? {} : { stack: err.stack }),
  });
}

// Helper to create API errors
export function createApiError(
  message: string,
  statusCode: number,
  code?: string,
  details?: unknown
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}
