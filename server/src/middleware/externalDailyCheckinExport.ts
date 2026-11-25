import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function auditExternalDailyCheckinExport(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  res.locals.externalDailyCheckinRequestId = requestId;
  res.on('finish', () => {
    const audit = res.locals.externalDailyCheckinExportAudit as {
      filters: Record<string, string | number | null>;
      recordCount: number;
      fileSizeBytes: number;
      format: string;
    } | undefined;
    const details = {
      requestId,
      at: new Date().toISOString(),
      ip: req.ip,
      path: req.originalUrl.split('?')[0],
      httpStatus: res.statusCode,
      ...(audit ?? {}),
    };
    if (res.statusCode < 400 && audit) {
      console.info('[External daily check-in export] completed', JSON.stringify(details));
    } else {
      console.warn('[External daily check-in export] request not completed', JSON.stringify(details));
    }
  });
  next();
}
