import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';

export interface NotificationRecipient extends RowDataPacket {
  id: number;
  partner_user_id: number;
}

export interface BoundFcmToken extends RowDataPacket {
  id: number;
  user_id: number;
  fcm_token: string;
}

export interface NotificationHistoryInput {
  requestId: string;
  userId: number;
  partnerUserId: number;
  initiatedByUserId: number | null;
  source: 'PARTNER' | 'ADMIN' | 'CRON_DAILY' | 'CRON_INACTIVITY' | 'CRON_NO_TASK' | 'SYSTEM';
  title: string;
  body: string;
  data: Record<string, string>;
  deliveryStatus: 'RECORDED' | 'SENT' | 'FAILED';
  deviceCount: number;
  acceptedDeviceCount: number;
  errorCode: string | null;
}

export interface NotificationHistoryQuery {
  offset: number;
  limit: number;
  search: string;
}

export interface NotificationHistoryRow extends RowDataPacket {
  request_id: string;
  title: string;
  body: string;
  sent: number;
  failed: number;
  recorded: number;
  initiated_by: string | null;
  created_at: string;
}

export interface MirroredEmployee extends RowDataPacket {
  id: number;
  partner_user_id: number;
  name: string;
  email: string;
  job_title: string;
  department: string;
  partner_status: string | null;
  is_active: number;
  is_acc_admin: number;
  role: string;
}

export async function findNotificationRecipients(partnerUserIds: number[]): Promise<NotificationRecipient[]> {
  const placeholders = partnerUserIds.map(() => '?').join(', ');
  const [rows] = await pool.query<NotificationRecipient[]>(
    `SELECT id, partner_user_id
     FROM users
     WHERE partner_user_id IN (${placeholders})
       AND is_active = 1
       AND partner_status = 'ACTIVE'
       AND is_acc_admin = 0
       AND role <> 'admin'`,
    partnerUserIds,
  );
  return rows;
}

export async function listNotificationRecipients(): Promise<MirroredEmployee[]> {
  const [rows] = await pool.query<MirroredEmployee[]>(
    `SELECT id, partner_user_id, name, email, job_title, department,
            partner_status, is_active, is_acc_admin, role
     FROM users
     WHERE partner_user_id IS NOT NULL
       AND is_active = 1
       AND partner_status = 'ACTIVE'
       AND is_acc_admin = 0
       AND role <> 'admin'
     ORDER BY department, name`,
  );
  return rows;
}

export async function listMirroredEmployees(): Promise<MirroredEmployee[]> {
  const [rows] = await pool.query<MirroredEmployee[]>(
    `SELECT id, partner_user_id, name, email, job_title, department,
            partner_status, is_active, is_acc_admin, role
     FROM users
     WHERE partner_user_id IS NOT NULL
     ORDER BY name`,
  );
  return rows;
}

export async function getNotificationHistory(query: NotificationHistoryQuery) {
  const search = query.search.trim();
  const searchFilter = search
    ? `WHERE h.title LIKE ? OR h.body LIKE ? OR admin.name LIKE ?`
    : '';
  const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
  const [countRows] = await pool.query<Array<RowDataPacket & { total: number }>>(
    `SELECT COUNT(DISTINCT h.request_id) AS total
     FROM notification_history h
     LEFT JOIN users admin ON admin.id = h.initiated_by_user_id
     ${searchFilter}`,
    searchParams,
  );
  const [rows] = await pool.query<NotificationHistoryRow[]>(
    `SELECT h.request_id, MIN(h.title) AS title, MIN(h.body) AS body,
            SUM(h.delivery_status = 'SENT') AS sent,
            SUM(h.delivery_status = 'RECORDED') AS recorded,
            SUM(h.delivery_status = 'FAILED') AS failed,
            MAX(CASE h.source
              WHEN 'CRON_DAILY' THEN 'Tự động - 09:00'
              WHEN 'CRON_INACTIVITY' THEN 'Tự động - 09:30'
              WHEN 'CRON_NO_TASK' THEN 'Tự động - 10:00'
              WHEN 'PARTNER' THEN 'Checkin'
              WHEN 'ADMIN' THEN admin.name
              ELSE 'Hệ thống'
            END) AS initiated_by,
            MAX(h.created_at) AS created_at
     FROM notification_history h
     LEFT JOIN users admin ON admin.id = h.initiated_by_user_id
     ${searchFilter}
     GROUP BY h.request_id
     ORDER BY MAX(h.created_at) DESC
     LIMIT ? OFFSET ?`,
    [...searchParams, query.limit, query.offset],
  );

  return { rows, total: Number(countRows[0]?.total ?? 0) };
}

export async function getBoundFcmTokens(userIds: number[]): Promise<BoundFcmToken[]> {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map(() => '?').join(', ');
  const [rows] = await pool.query<BoundFcmToken[]>(
    `SELECT id, user_id, fcm_token
     FROM user_fcm_tokens
     WHERE user_id IN (${placeholders}) AND is_bound = 1`,
    userIds,
  );
  return rows;
}

export async function deleteInvalidFcmTokens(tokenIds: number[]): Promise<void> {
  if (tokenIds.length === 0) return;
  const placeholders = tokenIds.map(() => '?').join(', ');
  await pool.query(`DELETE FROM user_fcm_tokens WHERE id IN (${placeholders})`, tokenIds);
}

export async function saveNotificationHistory(rows: NotificationHistoryInput[]): Promise<void> {
  if (rows.length === 0) return;
  const params = rows.flatMap((row) => [
    row.requestId,
    row.userId,
    row.partnerUserId,
    row.initiatedByUserId,
    row.source,
    row.title,
    row.body,
    JSON.stringify(row.data),
    row.deliveryStatus,
    row.deviceCount,
    row.acceptedDeviceCount,
    row.errorCode,
  ]);
  await pool.query(
    `INSERT INTO notification_history
       (request_id, user_id, partner_user_id, initiated_by_user_id, source, title, body, data, delivery_status,
        device_count, accepted_device_count, error_code)
     VALUES ${rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
    params,
  );
}

export async function savePartnerAudit(input: {
  requestId: string;
  partnerCode: string | null;
  method: string;
  path: string;
  recipientCount: number | null;
  httpStatus: number;
  outcome: string;
  durationMs: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO internal_partner_audit
       (request_id, partner_code, method, path, recipient_count, http_status, outcome, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.requestId,
      input.partnerCode,
      input.method,
      input.path,
      input.recipientCount,
      input.httpStatus,
      input.outcome,
      input.durationMs,
    ],
  );
}
