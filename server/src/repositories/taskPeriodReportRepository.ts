import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';

export interface PeriodReportTask extends RowDataPacket {
  id: number;
  taskCode: string;
  title: string;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  currentlyOverdue: number;
}

export interface PeriodReportAssignment extends RowDataPacket {
  taskId: number;
  userId: number;
  name: string;
  department: string | null;
}

function periodTaskWhere() {
  return `(
    (t.created_at >= ? AND t.created_at < DATE_ADD(?, INTERVAL 1 DAY))
    OR (COALESCE(t.completed_at, t.actual_date) >= ? AND
        COALESCE(t.completed_at, t.actual_date) < DATE_ADD(?, INTERVAL 1 DAY))
    OR (t.due_date BETWEEN ? AND ? AND t.due_date < CURDATE()
        AND t.status NOT IN ('DONE', 'GOLIVE'))
  )`;
}

function departmentScope() {
  return `(
    ? IS NULL
    OR EXISTS (
      SELECT 1
      FROM task_assignees scope_ta
      JOIN users scope_user ON scope_user.id = scope_ta.user_id
      WHERE scope_ta.task_id = t.id AND scope_user.department = ?
    )
    OR (
      NOT EXISTS (SELECT 1 FROM task_assignees legacy_ta WHERE legacy_ta.task_id = t.id)
      AND EXISTS (
        SELECT 1 FROM users scope_user
        WHERE scope_user.id = t.assignee_user_id AND scope_user.department = ?
      )
    )
  )`;
}

export async function listPeriodReportTasks(
  startDate: string,
  endDate: string,
  department: string | null,
): Promise<PeriodReportTask[]> {
  const [rows] = await pool.query<PeriodReportTask[]>(
    `    SELECT t.id, t.task_code AS taskCode, t.title, t.status, t.priority,
           t.start_date AS startDate, t.due_date AS dueDate,
           t.created_at AS createdAt, COALESCE(t.completed_at, t.actual_date) AS completedAt,
           (t.due_date < CURDATE() AND t.status NOT IN ('DONE', 'GOLIVE')) AS currentlyOverdue
    FROM tasks t
    WHERE t.deleted_at IS NULL
      AND ${periodTaskWhere()}
      AND ${departmentScope()}
    ORDER BY t.created_at DESC, t.id DESC`,
    [
     startDate, endDate, startDate, endDate, startDate, endDate,
     department, department, department,
    ],
  );
  return rows;
}

export async function listPeriodReportAssignments(
  startDate: string,
  endDate: string,
  department: string | null,
): Promise<PeriodReportAssignment[]> {
  const [rows] = await pool.query<PeriodReportAssignment[]>(
    `SELECT DISTINCT t.id AS taskId, report_user.id AS userId,
            report_user.name, report_user.department
     FROM tasks t
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     JOIN users report_user ON report_user.id = COALESCE(ta.user_id, t.assignee_user_id)
     WHERE t.deleted_at IS NULL
       AND ${periodTaskWhere()}
       AND (? IS NULL OR report_user.department = ?)`,
    [
      startDate, endDate, startDate, endDate, startDate, endDate,
      department, department,
    ],
  );
  return rows;
}
