import type { Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
import { HttpError } from '../middleware/errorHandler';

interface CheckinEmployeeRow extends RowDataPacket {
  userId: number;
  name: string;
  employeeCode: string;
  jobTitle: string;
  department: string | null;
  isComplete: number | null;
  reviewConfirmed: number | null;
  planConfirmed: number | null;
  blockerStatus: 'NONE' | 'BLOCKED' | null;
  blockerDescription: string | null;
  blockerImpact: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  blockerFeedback: string | null;
  blockerFeedbackBy: string | null;
  blockerFeedbackAt: string | null;
  blockerTaskId: number | null;
  reviewedTaskIds: string | null;
  completedAt: string | null;
  savedAt: string | null;
}

interface CheckinTaskRow extends RowDataPacket {
  id: number;
  taskCode: string;
  title: string;
  status: string;
  projectName: string | null;
}

function parseDate(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${field} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

function storedTaskIds(value: string | null): number[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Stored Daily Check-in has invalid reviewed task data');
  }
  if (!Array.isArray(parsed) || parsed.some((id) => !Number.isInteger(Number(id)) || Number(id) <= 0)) {
    throw new Error('Stored Daily Check-in has invalid reviewed task data');
  }
  return [...new Set(parsed.map(Number))];
}

async function getManagerScope(userId: number) {
  const [rows] = await pool.query<Array<RowDataPacket & {
    role: string;
    isAccAdmin: number;
    jobTitle: string;
    department: string | null;
  }>>(
    `SELECT role, is_acc_admin AS isAccAdmin, job_title AS jobTitle, department
     FROM users WHERE id = ? AND is_active = 1 LIMIT 1`,
    [userId],
  );
  const user = rows[0];
  if (!user) throw new HttpError(401, 'Authenticated user no longer exists');
  const isAdmin = user.role === 'admin' || Boolean(user.isAccAdmin);
  if (!isAdmin && user.jobTitle !== 'Project Lead') {
    throw new HttpError(403, 'Only administrators and project leads can view Daily Check-in statistics');
  }
  return { isAdmin, department: user.department, userId };
}

async function employeesForDate(date: string, userId: number) {
  const { isAdmin, department, userId: managerId } = await getManagerScope(userId);
  const scopeFilter = isAdmin ? '' : `AND (
       u.department = ? OR EXISTS (
         SELECT 1
         FROM project_members lead_member
         JOIN project_members employee_member ON employee_member.project_id = lead_member.project_id
         WHERE lead_member.user_id = ? AND lead_member.role_in_project <> 'lead'
           AND employee_member.user_id = u.id
       )
     )`;
  const scopeParams = isAdmin ? [] : [department, managerId];
  const [rows] = await pool.query<CheckinEmployeeRow[]>(
    `SELECT u.id AS userId, u.name, u.employee_code AS employeeCode,
            u.job_title AS jobTitle, u.department,
            c.is_complete AS isComplete, c.review_confirmed AS reviewConfirmed,
            c.plan_confirmed AS planConfirmed, c.blocker_status AS blockerStatus,
            c.blocker_description AS blockerDescription, c.blocker_impact AS blockerImpact,
            c.blocker_task_id AS blockerTaskId, c.reviewed_task_ids AS reviewedTaskIds,
            c.completed_at AS completedAt, c.updated_at AS savedAt
     FROM users u
     LEFT JOIN daily_checkins c ON c.user_id = u.id AND c.checkin_date = ?
     WHERE u.is_active = 1 AND u.role <> 'admin' AND u.is_acc_admin = 0
       ${scopeFilter}
     ORDER BY u.name ASC`,
    [date, ...scopeParams],
  );
  return rows;
}

export async function stats(req: Request, res: Response) {
  const selectedDate = parseDate(req.query.date, 'date');
  const date = selectedDate ?? (await pool.query<Array<RowDataPacket & { today: string }>>(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today",
  ))[0][0].today;
  const employees = await employeesForDate(date, req.user!.id);
  const ids = employees.map((employee) => Number(employee.userId));
  const plannedCounts = new Map<number, number>();
  if (ids.length > 0) {
    const [plannedRows] = await pool.query<Array<RowDataPacket & { userId: number; count: number }>>(
      `SELECT user_id AS userId, COUNT(*) AS count
       FROM daily_checkin_tasks
       WHERE checkin_date = ? AND user_id IN (${ids.map(() => '?').join(',')})
       GROUP BY user_id`,
      [date, ...ids],
    );
    plannedRows.forEach((row) => plannedCounts.set(Number(row.userId), Number(row.count)));
  }

  const summaries = employees.map((employee) => {
    const reviewedTaskIds = storedTaskIds(employee.reviewedTaskIds);
    const complete = Boolean(employee.isComplete);
    return {
      userId: Number(employee.userId),
      name: employee.name,
      employeeCode: employee.employeeCode,
      jobTitle: employee.jobTitle,
      department: employee.department,
      isComplete: complete,
      hasCheckin: employee.isComplete !== null,
      blockerStatus: employee.blockerStatus,
      blockerImpact: employee.blockerImpact,
      reviewedTaskCount: employee.reviewConfirmed ? reviewedTaskIds.length : 0,
      plannedTaskCount: plannedCounts.get(Number(employee.userId)) ?? 0,
      completedAt: employee.completedAt,
      savedAt: employee.savedAt,
    };
  });
  const completed = summaries.filter((employee) => employee.isComplete).length;
  const blockers = employees.filter((employee) =>
    Boolean(employee.isComplete) && employee.blockerStatus === 'BLOCKED',
  ).length;
  const reviewedTasks = employees.reduce((total, employee) =>
    total + (employee.reviewConfirmed ? storedTaskIds(employee.reviewedTaskIds).length : 0), 0);

  res.json({
    data: {
      date,
      totalEmployees: summaries.length,
      completedCheckins: completed,
      pendingCheckins: summaries.length - completed,
      completionRate: summaries.length > 0 ? Math.round((completed / summaries.length) * 100) : 0,
      blockerCount: blockers,
      reviewedTasks,
      employees: summaries,
    },
  });
}

export async function employeeDetail(req: Request, res: Response) {
  const rawUserId = Number(req.params.userId);
  if (!Number.isInteger(rawUserId) || rawUserId <= 0) throw new HttpError(400, 'Invalid user id');
  const selectedDate = parseDate(req.query.date, 'date');
  const date = selectedDate ?? (await pool.query<Array<RowDataPacket & { today: string }>>(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today",
  ))[0][0].today;
  const { isAdmin, department, userId: managerId } = await getManagerScope(req.user!.id);
  const scopeFilter = isAdmin ? '' : `AND (
       u.department = ? OR EXISTS (
         SELECT 1
         FROM project_members lead_member
         JOIN project_members employee_member ON employee_member.project_id = lead_member.project_id
         WHERE lead_member.user_id = ? AND lead_member.role_in_project <> 'lead'
           AND employee_member.user_id = u.id
       )
     )`;
  const scopeParams = isAdmin ? [] : [department, managerId];
  const [rows] = await pool.query<CheckinEmployeeRow[]>(
    `SELECT u.id AS userId, u.name, u.employee_code AS employeeCode,
            u.job_title AS jobTitle, u.department,
            c.is_complete AS isComplete, c.review_confirmed AS reviewConfirmed,
            c.plan_confirmed AS planConfirmed, c.blocker_status AS blockerStatus,
            c.blocker_description AS blockerDescription, c.blocker_impact AS blockerImpact,
            c.blocker_task_id AS blockerTaskId, c.reviewed_task_ids AS reviewedTaskIds,
            c.blocker_feedback AS blockerFeedback,
            feedback_user.name AS blockerFeedbackBy, c.blocker_feedback_at AS blockerFeedbackAt,
            c.completed_at AS completedAt, c.updated_at AS savedAt
     FROM users u
     LEFT JOIN daily_checkins c ON c.user_id = u.id AND c.checkin_date = ?
     LEFT JOIN users feedback_user ON feedback_user.id = c.blocker_feedback_by_user_id
     WHERE u.id = ? AND u.is_active = 1 AND u.role <> 'admin' AND u.is_acc_admin = 0
       ${scopeFilter}
     LIMIT 1`,
    [date, rawUserId, ...scopeParams],
  );
  const employee = rows[0];
  if (!employee) throw new HttpError(404, 'Employee not found');

  const reviewedTaskIds = storedTaskIds(employee.reviewedTaskIds);
  const [plannedRows] = await pool.query<Array<RowDataPacket & { taskId: number }>>(
    `SELECT task_id AS taskId
     FROM daily_checkin_tasks WHERE user_id = ? AND checkin_date = ?
     ORDER BY position, task_id`,
    [rawUserId, date],
  );
  const plannedTaskIds = plannedRows.map((row) => Number(row.taskId));
  const taskIds = [...new Set([...reviewedTaskIds, ...plannedTaskIds])];
  const taskById = new Map<number, CheckinTaskRow>();
  for (let offset = 0; offset < taskIds.length; offset += 500) {
    const batch = taskIds.slice(offset, offset + 500);
    const [taskRows] = await pool.query<CheckinTaskRow[]>(
      `SELECT t.id, t.task_code AS taskCode, t.title, t.status, p.name AS projectName
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.deleted_at IS NULL AND t.id IN (${batch.map(() => '?').join(',')})`,
      batch,
    );
    taskRows.forEach((task) => taskById.set(Number(task.id), task));
  }
  const tasksForIds = (ids: number[]) => ids
    .map((id) => taskById.get(id))
    .filter((task): task is CheckinTaskRow => Boolean(task))
    .map((task) => ({
      id: Number(task.id),
      taskCode: task.taskCode,
      title: task.title,
      status: task.status,
      projectName: task.projectName,
    }));

  res.json({
    data: {
      user: {
        userId: Number(employee.userId),
        name: employee.name,
        employeeCode: employee.employeeCode,
        jobTitle: employee.jobTitle,
        department: employee.department,
      },
      date,
      checkin: employee.isComplete === null ? null : {
        isComplete: Boolean(employee.isComplete),
        reviewConfirmed: Boolean(employee.reviewConfirmed),
        planConfirmed: Boolean(employee.planConfirmed),
        completedAt: employee.completedAt,
        savedAt: employee.savedAt,
        blockerStatus: employee.blockerStatus,
        blockerDescription: employee.blockerDescription,
        blockerImpact: employee.blockerImpact,
        blockerTaskId: employee.blockerTaskId === null ? null : Number(employee.blockerTaskId),
        blockerFeedback: employee.blockerFeedback,
        blockerFeedbackBy: employee.blockerFeedbackBy,
        blockerFeedbackAt: employee.blockerFeedbackAt,
      },
      reviewedTasks: tasksForIds(reviewedTaskIds),
      plannedTasks: tasksForIds(plannedTaskIds),
    },
  });
}

export async function saveBlockerFeedback(req: Request, res: Response) {
  const rawUserId = Number(req.params.userId);
  if (!Number.isInteger(rawUserId) || rawUserId <= 0) throw new HttpError(400, 'Invalid user id');
  const selectedDate = parseDate(req.query.date, 'date');
  const date = selectedDate ?? (await pool.query<Array<RowDataPacket & { today: string }>>(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today",
  ))[0][0].today;
  const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback.trim() : null;
  if (feedback === null || feedback.length > 2000) {
    throw new HttpError(400, 'feedback must be a string with at most 2000 characters');
  }

  const employees = await employeesForDate(date, req.user!.id);
  const employee = employees.find((item) => Number(item.userId) === rawUserId);
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (!employee.isComplete || employee.blockerStatus !== 'BLOCKED') {
    throw new HttpError(409, 'Feedback can only be added to a completed blocker report');
  }

  const savedFeedback = feedback || null;
  await pool.query(
    `UPDATE daily_checkins
     SET blocker_feedback = ?, blocker_feedback_by_user_id = ?,
         blocker_feedback_at = IF(? IS NULL, NULL, CURRENT_TIMESTAMP)
     WHERE user_id = ? AND checkin_date = ? AND blocker_status = 'BLOCKED' AND is_complete = 1`,
    [savedFeedback, savedFeedback ? req.user!.id : null, savedFeedback, rawUserId, date],
  );
  const [rows] = await pool.query<Array<RowDataPacket & {
    blockerFeedback: string | null;
    blockerFeedbackBy: string | null;
    blockerFeedbackAt: string | null;
  }>>(
    `SELECT c.blocker_feedback AS blockerFeedback,
            feedback_user.name AS blockerFeedbackBy,
            c.blocker_feedback_at AS blockerFeedbackAt
     FROM daily_checkins c
     LEFT JOIN users feedback_user ON feedback_user.id = c.blocker_feedback_by_user_id
     WHERE c.user_id = ? AND c.checkin_date = ? AND c.blocker_status = 'BLOCKED' AND c.is_complete = 1`,
    [rawUserId, date],
  );
  if (!rows[0]) throw new HttpError(409, 'The blocker report is no longer available');
  res.json({ data: rows[0] });
}
