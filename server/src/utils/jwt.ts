import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { AuthUser } from '../types';

export function signToken(payload: AuthUser): string {
  const options: SignOptions = {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload & AuthUser;
  return { id: decoded.id, email: decoded.email };
}
