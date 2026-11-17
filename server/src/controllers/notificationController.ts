import type { Request, Response } from 'express';
import { HttpError } from '../middleware/errorHandler';
import { sendNotificationToCheckin } from '../services/checkinService';
import {
  getAdminMirroredEmployees,
  getAdminNotificationHistory,
  getAdminNotificationHistoryDetail,
  getAdminNotificationRecipients,
  parseSendNotificationInput,
  recordPartnerNotification,
} from '../services/notificationService';

export async function sendNotification(req: Request, res: Response) {
  const input = parseSendNotificationInput(req.body);
  const result = await recordPartnerNotification(input);
  res.status(200).json(result);
}

export async function sendAdminNotification(req: Request, res: Response) {
  const input = parseSendNotificationInput(req.body);
  const result = await sendNotificationToCheckin(input);
  res.status(200).json(result);
}

export async function notificationRecipients(_req: Request, res: Response) {
  const data = await getAdminNotificationRecipients();
  res.json({ data, count: data.length });
}

export async function mirroredEmployees(_req: Request, res: Response) {
  const data = await getAdminMirroredEmployees();
  res.json({ data, count: data.length });
}

function parsePositiveInteger(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new HttpError(400, `Query value must be an integer between 1 and ${max}`);
  }
  return parsed;
}

export async function notificationHistory(req: Request, res: Response) {
  const page = parsePositiveInteger(req.query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInteger(req.query.limit, 20, 100);
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  const result = await getAdminNotificationHistory(page, limit, search);
  res.json(result);
}

export async function notificationHistoryDetail(req: Request, res: Response) {
  const requestId = req.params.requestId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new HttpError(400, 'Invalid notification request id');
  }
  const data = await getAdminNotificationHistoryDetail(requestId);
  if (!data) throw new HttpError(404, 'Notification history not found');
  res.json({ data });
}
