import type { Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import type {
  DailyCheckinExportFilters,
  DailyCheckinExportRecord,
  DailyCheckinExportStatus,
} from '../repositories/dailyCheckinExportRepository';
import { loadDailyCheckinExport } from '../repositories/dailyCheckinExportRepository';
import { pool } from '../config/db';
import { HttpError } from '../middleware/errorHandler';

const MAX_RANGE_DAYS = 31;

function queryString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be a single string value`);
  return value;
}

function parseDate(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${field} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

function parsePositiveInteger(value: string | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${field} must be a positive integer`);
  }
  return parsed;
}

async function parseFilters(req: Request): Promise<DailyCheckinExportFilters> {
  const selectedDate = parseDate(queryString(req.query.date, 'date'), 'date');
  const fromDate = parseDate(queryString(req.query.fromDate, 'fromDate'), 'fromDate');
  const toDate = parseDate(queryString(req.query.toDate, 'toDate'), 'toDate');
  if (selectedDate && (fromDate || toDate)) {
    throw new HttpError(400, 'Use either date or fromDate/toDate, not both');
  }
  if ((fromDate === undefined) !== (toDate === undefined)) {
    throw new HttpError(400, 'Both fromDate and toDate are required');
  }

  let startDate = selectedDate ?? fromDate;
  let endDate = selectedDate ?? toDate;
  if (!startDate) {
    const [rows] = await pool.query<Array<RowDataPacket & { today: string }>>(
      "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today",
    );
    startDate = rows[0].today;
    endDate = startDate;
  }
  if (!endDate || startDate > endDate) {
    throw new HttpError(400, 'toDate must not precede fromDate');
  }
  const rangeDays = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new HttpError(400, `Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }

  const departmentId = queryString(req.query.departmentId, 'departmentId');
  if (departmentId !== undefined && (!departmentId.trim() || departmentId.length > 80)) {
    throw new HttpError(400, 'departmentId must be a non-empty department value of at most 80 characters');
  }
  const rawStatus = queryString(req.query.status, 'status');
  if (rawStatus !== undefined && !['Submitted', 'Pending', 'hasBlocker'].includes(rawStatus)) {
    throw new HttpError(400, 'status must be Submitted, Pending, or hasBlocker');
  }
  const rawFormat = queryString(req.query.format, 'format');
  if (rawFormat !== undefined && rawFormat !== 'json') {
    throw new HttpError(400, 'format only supports json');
  }

  return {
    fromDate: startDate,
    toDate: endDate,
    userId: parsePositiveInteger(queryString(req.query.userId, 'userId'), 'userId'),
    departmentId: departmentId?.trim(),
    teamId: parsePositiveInteger(queryString(req.query.teamId, 'teamId'), 'teamId'),
    status: rawStatus as DailyCheckinExportStatus | undefined,
  };
}

function summarize(records: DailyCheckinExportRecord[]) {
  const submittedCount = records.filter((record) => record.checkin?.isComplete).length;
  const blockerCount = records.filter((record) => record.hasBlocker).length;
  return {
    recordCount: records.length,
    submittedCount,
    pendingCount: records.length - submittedCount,
    blockerCount,
    completionRate: records.length > 0 ? Math.round((submittedCount / records.length) * 100) : 0,
  };
}

export async function exportDailyCheckin(req: Request, res: Response) {
  const filters = await parseFilters(req);
  const records = await loadDailyCheckinExport(filters);
  const summary = summarize(records);
  const auditFilters = {
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    userId: filters.userId ?? null,
    departmentId: filters.departmentId ?? null,
    teamId: filters.teamId ?? null,
    status: filters.status ?? null,
  };

  const payload = {
    data: {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      filters: auditFilters,
      summary,
      records,
    },
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.locals.externalDailyCheckinExportAudit = {
    filters: auditFilters,
    recordCount: records.length,
    fileSizeBytes: body.length,
    format: 'json',
  };
  res.type('application/json; charset=utf-8').send(body);
}
