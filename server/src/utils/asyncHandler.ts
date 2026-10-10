import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route handler so thrown errors / rejected promises
 * are forwarded to Express's error-handling middleware.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
