import type { NextFunction, Request, Response } from 'express';

/** Error type carrying an HTTP status code, thrown from controllers. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** 404 handler for unmatched routes. */
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ message: 'Route not found' });
}

/** Central error handler. Must keep the 4-arg signature for Express. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }

  // Surface MySQL duplicate-key errors as 409 instead of a generic 500.
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Duplicate value violates a unique constraint' });
  }

  console.error('[Unhandled error]', err);
  res.status(500).json({ message: 'Internal server error' });
}
