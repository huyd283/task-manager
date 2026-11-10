import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { savePartnerAudit } from '../repositories/notificationRepository';

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function auditInternalPartnerRequest(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  res.on('finish', () => {
    const rawIds = req.body && typeof req.body === 'object' && 'userIds' in req.body
      ? (req.body as { userIds?: unknown }).userIds
      : undefined;
    const input = {
      requestId,
      partnerCode: headerValue(req.headers['x-partner-code']).slice(0, 100) || null,
      method: req.method,
      path: req.originalUrl.split('?')[0].slice(0, 255),
      recipientCount: Array.isArray(rawIds) ? rawIds.length : null,
      httpStatus: res.statusCode,
      outcome: res.statusCode < 400 ? 'SUCCESS' : res.statusCode < 500 ? 'REJECTED' : 'ERROR',
      durationMs: Math.max(0, Date.now() - startedAt),
    };
    void savePartnerAudit(input)
      .then(() => console.info('[Internal partner audit]', JSON.stringify(input)))
      .catch((error: unknown) => {
        console.error('[Internal partner audit] failed to persist audit record', error);
      });
  });

  next();
}

export function authenticateInternalPartner(req: Request, res: Response, next: NextFunction) {
  const expectedCode = env.checkin.partnerCode;
  const expectedToken = env.checkin.partnerToken;
  const partnerCode = headerValue(req.headers['x-partner-code']);
  const partnerToken = headerValue(req.headers['x-partner-token']);

  if (
    !expectedCode ||
    !expectedToken ||
    !safeEqual(partnerCode, expectedCode) ||
    !safeEqual(partnerToken, expectedToken)
  ) {
    return res.status(401).json({ message: 'Invalid partner credentials', code: 'INVALID_PARTNER_CREDENTIALS' });
  }
  return next();
}
