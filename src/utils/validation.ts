/**
 * Zod validation schemas for API requests
 */

import { z } from 'zod';

export const reviewRequestSchema = z.object({
  pgn: z.string().min(1, 'PGN is required').max(50000, 'PGN is too long'),
  playerColor: z.enum(['white', 'black']),
  gameId: z.string().uuid().optional(),
  platform: z.enum(['lichess', 'chesscom']).optional(),
  options: z
    .object({
      depth: z.number().int().min(6).max(24).optional(),
      includeRawEvals: z.boolean().optional(),
    })
    .optional(),
});

export type ReviewRequestInput = z.infer<typeof reviewRequestSchema>;

export const reviewIdSchema = z.object({
  reviewId: z.string().uuid(),
});

export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error };
}
