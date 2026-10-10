import type { NextFunction, Request, Response } from 'express';
import { findAuthUserById } from '../repositories/userRepository';
import { verifyToken } from '../utils/jwt';

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches the
 * decoded principal to `req.user`. Rejects with 401 when missing/invalid.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }

  const token = header.slice('Bearer '.length).trim();
  let principal;
  try {
    principal = verifyToken(token);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    const user = await findAuthUserById(principal.id);
    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'Account is inactive or no longer exists' });
    }
    req.user = { id: user.id, email: user.email, role: user.role, jobTitle: user.job_title };
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Administrator access required' });
  }
  return next();
}
