import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';

export interface DailyTaskReminder {
  partnerUserId: number;
  overdueCount: number;
  dueSoonCount: number;
  newlyAssignedCount: number;
}

export interface InactiveTaskUser {
  partnerUserId: number;
}

export interface EmployeeWithoutTask {
  partnerUserId: number;
}

interface DailyTaskReminderRow extends RowDataPacket {
  partnerUserId: number;
  overdueCount: number | string;
  dueSoonCount: number | string;
  newlyAssignedCount: number | string;
}

interface InactiveTaskUserRow extends RowDataPacket {
  partnerUserId: number;
}

interface EmployeeWithoutTaskRow extends RowDataPacket {
  partnerUserId: number;
}

const ACTIVE_TASK_FILTER = "t.deleted_at IS NULL AND t.status NOT IN ('DONE', 'GOLIVE')";
const ACTIVE_PARTNER_USER_FILTER = `
  u.partner_user_id IS NOT NULL
  AND u.is_active = 1
  AND u.partner_status = 'ACTIVE'
  AND u.is_acc_admin = 0
  AND u.role <> 'admin'`;

export async function listDailyTaskReminders(
  date: string,
  startOfDay: string,
  startOfNextDay: string,
): Promise<DailyTaskReminder[]> {
  const [rows] = await pool.query<DailyTaskReminderRow[]>(
    `SELECT u.partner_user_id AS partnerUserId,
            COUNT(DISTINCT CASE WHEN t.due_date < ? THEN t.id END) AS overdueCount,
            COUNT(DISTINCT CASE
              WHEN t.due_date >= ? AND t.due_date <= DATE_ADD(?, INTERVAL 1 DAY)
              THEN t.id
            END) AS dueSoonCount,
            COUNT(DISTINCT CASE
              WHEN (t.created_at >= ? AND t.created_at < ?)
                OR EXISTS (
                  SELECT 1
                  FROM task_history h
                  WHERE h.task_id = t.id
                    AND h.action_type = 'assigneeIds'
                    AND h.\`timestamp\` >= ? AND h.\`timestamp\` < ?
                    AND FIND_IN_SET(u.name, REPLACE(COALESCE(h.new_value, ''), ', ', ',')) > 0
                    AND FIND_IN_SET(u.name, REPLACE(COALESCE(h.old_value, ''), ', ', ',')) = 0
                )
              THEN t.id
            END) AS newlyAssignedCount
     FROM users u
     INNER JOIN task_assignees ta ON ta.user_id = u.id
     INNER JOIN tasks t ON t.id = ta.task_id
     WHERE ${ACTIVE_PARTNER_USER_FILTER}
       AND ${ACTIVE_TASK_FILTER}
     GROUP BY u.id, u.partner_user_id
     HAVING overdueCount > 0 OR dueSoonCount > 0 OR newlyAssignedCount > 0`,
    [
      date,
      date,
      date,
      startOfDay,
      startOfNextDay,
      startOfDay,
      startOfNextDay,
    ],
  );
  return rows.map((row) => ({
    partnerUserId: Number(row.partnerUserId),
    overdueCount: Number(row.overdueCount),
    dueSoonCount: Number(row.dueSoonCount),
    newlyAssignedCount: Number(row.newlyAssignedCount),
  }));
}

export async function listUsersWithoutTaskActivityToday(
  startOfDay: string,
  now: string,
): Promise<InactiveTaskUser[]> {
  const [rows] = await pool.query<InactiveTaskUserRow[]>(
    `SELECT DISTINCT u.partner_user_id AS partnerUserId
     FROM users u
     WHERE ${ACTIVE_PARTNER_USER_FILTER}
       AND EXISTS (
         SELECT 1
         FROM task_assignees assigned
         INNER JOIN tasks t ON t.id = assigned.task_id
         WHERE assigned.user_id = u.id
           AND ${ACTIVE_TASK_FILTER}
       )
       AND NOT EXISTS (
         SELECT 1
         FROM task_history h
         INNER JOIN task_assignees assigned ON assigned.task_id = h.task_id
         WHERE assigned.user_id = u.id
           AND h.user_id = u.id
           AND h.\`timestamp\` >= ? AND h.\`timestamp\` < ?
       )
       AND NOT EXISTS (
         SELECT 1
         FROM task_comments c
         INNER JOIN task_assignees assigned ON assigned.task_id = c.task_id
         WHERE assigned.user_id = u.id
           AND c.user_id = u.id
           AND c.created_at >= ? AND c.created_at < ?
       )
       AND NOT EXISTS (
         SELECT 1
         FROM task_attachments a
         INNER JOIN task_assignees assigned ON assigned.task_id = a.task_id
         WHERE assigned.user_id = u.id
           AND a.user_id = u.id
           AND a.created_at >= ? AND a.created_at < ?
       )
     ORDER BY u.partner_user_id`,
    [startOfDay, now, startOfDay, now, startOfDay, now],
  );
  return rows.map((row) => ({ partnerUserId: Number(row.partnerUserId) }));
}

export async function listDevelopmentDepartmentUsersWithoutActiveTasks(): Promise<EmployeeWithoutTask[]> {
  const [rows] = await pool.query<EmployeeWithoutTaskRow[]>(
    `SELECT u.partner_user_id AS partnerUserId
     FROM users u
     WHERE ${ACTIVE_PARTNER_USER_FILTER}
       AND UPPER(TRIM(u.department)) = 'DEVELOPMENT DEPARTMENT'
       AND NOT EXISTS (
         SELECT 1
         FROM tasks t
         WHERE t.deleted_at IS NULL
           AND t.status NOT IN ('DONE', 'GOLIVE')
           AND (
             EXISTS (
               SELECT 1 FROM task_assignees ta
               WHERE ta.task_id = t.id AND ta.user_id = u.id
             )
             OR t.assignee_user_id = u.id
           )
       )
     ORDER BY u.partner_user_id`,
  );
  return rows.map((row) => ({ partnerUserId: Number(row.partnerUserId) }));
}
