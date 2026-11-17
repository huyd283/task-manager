import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
import { HttpError } from '../middleware/errorHandler';
import { saveNotificationHistory, updateNotificationHistoryDelivery } from '../repositories/notificationRepository';
import { sendNotificationToCheckin } from '../services/checkinService';

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
  blockerId: number | null;
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

async function employeesForDate(date: string, userId: number, projectId?: number) {
  const { isAdmin, department, userId: managerId } = await getManagerScope(userId);
  if (projectId && !isAdmin) {
    const [managerProjects] = await pool.query<Array<RowDataPacket & { allowed: number }>>(
      `SELECT EXISTS (
         SELECT 1 FROM project_members
         WHERE project_id = ? AND user_id = ? AND role_in_project <> 'lead'
       ) AS allowed`,
      [projectId, managerId],
    );
    if (!managerProjects[0].allowed) throw new HttpError(403, 'You cannot view this project scope');
  }
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
  const projectFilter = projectId
    ? 'AND EXISTS (SELECT 1 FROM project_members project_member WHERE project_member.project_id = ? AND project_member.user_id = u.id)'
    : '';
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
       ${scopeFilter} ${projectFilter}
     ORDER BY u.name ASC`,
    [date, ...scopeParams, ...(projectId ? [projectId] : [])],
  );
  return rows;
}

export async function stats(req: Request, res: Response) {
  const selectedDate = parseDate(req.query.date, 'date');
  const projectId = parsePositiveQuery(req.query.projectId, 'projectId');
  const date = selectedDate ?? (await pool.query<Array<RowDataPacket & { today: string }>>(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today",
  ))[0][0].today;
  const employees = await employeesForDate(date, req.user!.id, projectId);
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
  const managerScope = await getManagerScope(req.user!.id);
  const blockerScopeFilter = managerScope.isAdmin ? '' : `AND (
       u.department = ? OR EXISTS (
         SELECT 1
         FROM project_members lead_member
         JOIN project_members employee_member ON employee_member.project_id = lead_member.project_id
         WHERE lead_member.user_id = ? AND lead_member.role_in_project <> 'lead'
           AND employee_member.user_id = u.id
       )
     )`;
  const blockerProjectFilter = projectId
    ? `AND (
         blocker_task.project_id = ? OR EXISTS (
           SELECT 1 FROM project_members project_member
           WHERE project_member.project_id = ? AND project_member.user_id = u.id
         )
       )`
    : '';
  const [blockerCountRows] = await pool.query<Array<RowDataPacket & { count: number }>>(
    `SELECT COUNT(*) AS count
     FROM daily_checkin_blockers b
     JOIN daily_checkins c ON c.id = b.checkin_id
     JOIN users u ON u.id = c.user_id
     LEFT JOIN tasks blocker_task ON blocker_task.id = c.blocker_task_id
     WHERE b.status IN ('OPEN', 'IN_PROGRESS') AND c.is_complete = 1
       ${blockerScopeFilter} ${blockerProjectFilter}`,
    [
      ...(managerScope.isAdmin ? [] : [managerScope.department, managerScope.userId]),
      ...(projectId ? [projectId, projectId] : []),
    ],
  );
  const blockers = Number(blockerCountRows[0].count);
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
      projectId: projectId ?? null,
      reviewedTasks,
      employees: summaries,
    },
  });
}

function parsePositiveQuery(value: unknown, field: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${field} must be a positive integer`);
  }
  return parsed;
}

export async function employeeDetail(req: Request, res: Response) {
  const rawUserId = Number(req.params.userId);
  if (!Number.isInteger(rawUserId) || rawUserId <= 0) throw new HttpError(400, 'Invalid user id');
  const selectedDate = parseDate(req.query.date, 'date');
  const projectId = parsePositiveQuery(req.query.projectId, 'projectId');
  const date = selectedDate ?? (await pool.query<Array<RowDataPacket & { today: string }>>(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today",
  ))[0][0].today;
  if (projectId) {
    const scopedEmployees = await employeesForDate(date, req.user!.id, projectId);
    if (!scopedEmployees.some((employee) => Number(employee.userId) === rawUserId)) {
      throw new HttpError(404, 'Employee not found');
    }
  }
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
            c.blocker_task_id AS blockerTaskId, b.id AS blockerId,
            c.reviewed_task_ids AS reviewedTaskIds,
            c.blocker_feedback AS blockerFeedback,
            feedback_user.name AS blockerFeedbackBy, c.blocker_feedback_at AS blockerFeedbackAt,
            c.completed_at AS completedAt, c.updated_at AS savedAt
     FROM users u
     LEFT JOIN daily_checkins c ON c.user_id = u.id AND c.checkin_date = ?
     LEFT JOIN daily_checkin_blockers b ON b.checkin_id = c.id
     LEFT JOIN users feedback_user ON feedback_user.id = c.blocker_feedback_by_user_id
     WHERE u.id = ? AND u.is_active = 1 AND u.role <> 'admin' AND u.is_acc_admin = 0
       ${scopeFilter}
       ${projectId ? 'AND EXISTS (SELECT 1 FROM project_members project_member WHERE project_member.project_id = ? AND project_member.user_id = u.id)' : ''}
     LIMIT 1`,
    [date, rawUserId, ...scopeParams, ...(projectId ? [projectId] : [])],
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
  const blockerId = employee.blockerId === null ? null : Number(employee.blockerId);
  let blockerComments: Array<{ id: number; body: string; userName: string | null; createdAt: string }> = [];
  if (blockerId !== null) {
    const [commentRows] = await pool.query<Array<RowDataPacket & {
      id: number;
      body: string;
      userName: string | null;
      createdAt: string;
    }>>(
      `SELECT comment.id, comment.body, author.name AS userName, comment.created_at AS createdAt
       FROM daily_checkin_blocker_comments comment
       LEFT JOIN users author ON author.id = comment.user_id
       WHERE comment.blocker_id = ?
       ORDER BY comment.created_at, comment.id`,
      [blockerId],
    );
    blockerComments = commentRows.map((comment) => ({
      id: Number(comment.id),
      body: comment.body,
      userName: comment.userName,
      createdAt: comment.createdAt,
    }));
  }

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
        blockerId,
        blockerComments,
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

const BLOCKER_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
const BLOCKER_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
type BlockerStatus = (typeof BLOCKER_STATUSES)[number];
type BlockerPriority = (typeof BLOCKER_PRIORITIES)[number];
const BLOCKER_CATEGORIES = ['TECHNICAL', 'DEPENDENCY', 'RESOURCE', 'ACCESS', 'OTHER'] as const;
type BlockerCategory = (typeof BLOCKER_CATEGORIES)[number];

interface ManagedBlockerRow extends RowDataPacket {
  id: number;
  checkinId: number;
  userId: number;
  reporterName: string;
  employeeCode: string;
  department: string | null;
  checkinDate: string;
  description: string;
  impact: string | null;
  taskId: number | null;
  taskCode: string | null;
  taskTitle: string | null;
  taskStatus: string | null;
  projectId: number | null;
  projectName: string | null;
  status: BlockerStatus;
  priority: BlockerPriority;
  category: BlockerCategory;
  assigneeId: number | null;
  assigneeName: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  commentCount?: number;
}

function parseBlockerId(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new HttpError(400, 'Invalid blocker id');
  return parsed;
}

function blockerScopeClause(isAdmin: boolean): string {
  return isAdmin ? '' : `AND (
    u.department = ? OR EXISTS (
      SELECT 1
      FROM project_members lead_member
      JOIN project_members employee_member ON employee_member.project_id = lead_member.project_id
      WHERE lead_member.user_id = ? AND lead_member.role_in_project <> 'lead'
        AND employee_member.user_id = u.id
        AND (
          c.blocker_task_id IS NULL OR EXISTS (
            SELECT 1 FROM tasks scoped_task
            WHERE scoped_task.id = c.blocker_task_id
              AND scoped_task.project_id = lead_member.project_id
          )
        )
    )
  )`;
}

function blockerScopeParams(scope: Awaited<ReturnType<typeof getManagerScope>>): unknown[] {
  return scope.isAdmin ? [] : [scope.department, scope.userId];
}

const BLOCKER_SELECT = `SELECT b.id, c.id AS checkinId, u.id AS userId,
    u.name AS reporterName, u.employee_code AS employeeCode, u.department,
    c.checkin_date AS checkinDate, c.blocker_description AS description,
    c.blocker_impact AS impact, c.blocker_task_id AS taskId,
    t.task_code AS taskCode, t.title AS taskTitle, t.status AS taskStatus,
    p.id AS projectId, p.name AS projectName,
    b.status, b.priority, b.category, b.assignee_user_id AS assigneeId,
    assignee.name AS assigneeName, b.version, b.created_at AS createdAt,
    b.updated_at AS updatedAt, b.resolved_at AS resolvedAt,
    (SELECT COUNT(*) FROM daily_checkin_blocker_comments comments
     WHERE comments.blocker_id = b.id) AS commentCount
  FROM daily_checkin_blockers b
  JOIN daily_checkins c ON c.id = b.checkin_id
  JOIN users u ON u.id = c.user_id
  LEFT JOIN tasks t ON t.id = c.blocker_task_id
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN users assignee ON assignee.id = b.assignee_user_id`;

async function getManagedBlocker(blockerId: number, managerId: number): Promise<ManagedBlockerRow> {
  const scope = await getManagerScope(managerId);
  const [rows] = await pool.query<ManagedBlockerRow[]>(
    `${BLOCKER_SELECT}
     WHERE b.id = ? AND c.is_complete = 1 ${blockerScopeClause(scope.isAdmin)}
     LIMIT 1`,
    [blockerId, ...blockerScopeParams(scope)],
  );
  if (!rows[0]) throw new HttpError(404, 'Blocker not found');
  return rows[0];
}

function blockerPayload(row: ManagedBlockerRow) {
  return {
    id: Number(row.id),
    checkinId: Number(row.checkinId),
    userId: Number(row.userId),
    reporterName: row.reporterName,
    employeeCode: row.employeeCode,
    department: row.department,
    checkinDate: row.checkinDate,
    description: row.description,
    impact: row.impact,
    taskId: row.taskId === null ? null : Number(row.taskId),
    taskCode: row.taskCode,
    taskTitle: row.taskTitle,
    taskStatus: row.taskStatus,
    projectId: row.projectId === null ? null : Number(row.projectId),
    projectName: row.projectName,
    status: row.status,
    priority: row.priority,
    category: row.category,
    assigneeId: row.assigneeId === null ? null : Number(row.assigneeId),
    assigneeName: row.assigneeName,
    version: Number(row.version),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
    commentCount: Number(row.commentCount ?? 0),
  };
}

async function blockerDetail(blockerId: number, managerId: number) {
  const row = await getManagedBlocker(blockerId, managerId);
  const [commentRows] = await pool.query<Array<RowDataPacket & {
    id: number;
    body: string;
    userId: number | null;
    userName: string | null;
    createdAt: string;
  }>>(
    `SELECT comment.id, comment.body, comment.user_id AS userId,
            author.name AS userName, comment.created_at AS createdAt
     FROM daily_checkin_blocker_comments comment
     LEFT JOIN users author ON author.id = comment.user_id
     WHERE comment.blocker_id = ?
     ORDER BY comment.created_at ASC, comment.id ASC`,
    [blockerId],
  );
  const [historyRows] = await pool.query<Array<RowDataPacket & {
    id: number;
    actionType: string;
    oldValue: string | null;
    newValue: string | null;
    userName: string | null;
    createdAt: string;
  }>>(
    `SELECT history.id, history.action_type AS actionType,
            history.old_value AS oldValue, history.new_value AS newValue,
            actor.name AS userName, history.created_at AS createdAt
     FROM daily_checkin_blocker_history history
     LEFT JOIN users actor ON actor.id = history.user_id
     WHERE history.blocker_id = ?
     ORDER BY history.created_at DESC, history.id DESC`,
    [blockerId],
  );
  return {
    ...blockerPayload(row),
    comments: commentRows.map((comment) => ({
      id: Number(comment.id),
      body: comment.body,
      userId: comment.userId === null ? null : Number(comment.userId),
      userName: comment.userName,
      createdAt: comment.createdAt,
    })),
    history: historyRows.map((history) => ({
      id: Number(history.id),
      actionType: history.actionType,
      oldValue: history.oldValue,
      newValue: history.newValue,
      userName: history.userName,
      createdAt: history.createdAt,
    })),
  };
}

export async function listBlockers(req: Request, res: Response) {
  const scope = await getManagerScope(req.user!.id);
  const status = typeof req.query.status === 'string' ? req.query.status : 'ACTIVE';
  if (!['ACTIVE', 'ALL', ...BLOCKER_STATUSES].includes(status)) {
    throw new HttpError(400, 'Invalid blocker status filter');
  }
  const projectId = parsePositiveQuery(req.query.projectId, 'projectId');
  if (projectId && !scope.isAdmin) {
    const [managerProjects] = await pool.query<Array<RowDataPacket & { allowed: number }>>(
      `SELECT EXISTS (
         SELECT 1 FROM project_members
         WHERE project_id = ? AND user_id = ? AND role_in_project <> 'lead'
       ) AS allowed`,
      [projectId, scope.userId],
    );
    if (!managerProjects[0].allowed) throw new HttpError(403, 'You cannot view this project scope');
  }
  const statusFilter = status === 'ACTIVE'
    ? "AND b.status IN ('OPEN', 'IN_PROGRESS')"
    : status === 'ALL'
      ? ''
      : 'AND b.status = ?';
  const projectFilter = projectId
    ? `AND (
         t.project_id = ? OR EXISTS (
           SELECT 1 FROM project_members project_member
           WHERE project_member.project_id = ? AND project_member.user_id = u.id
         )
       )`
    : '';
  const statusParams = statusFilter === 'AND b.status = ?' ? [status] : [];
  const [rows] = await pool.query<ManagedBlockerRow[]>(
    `${BLOCKER_SELECT}
     WHERE c.is_complete = 1 ${statusFilter} ${blockerScopeClause(scope.isAdmin)} ${projectFilter}
     ORDER BY FIELD(b.priority, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'),
              FIELD(b.status, 'OPEN', 'IN_PROGRESS', 'RESOLVED'),
              b.updated_at DESC, b.id DESC
     LIMIT 200`,
    [
      ...statusParams,
      ...blockerScopeParams(scope),
      ...(projectId ? [projectId, projectId] : []),
    ],
  );
  res.json({
    data: rows.map((row) => ({ ...blockerPayload(row), comments: [], history: [] })),
    count: rows.length,
  });
}

export async function getBlocker(req: Request, res: Response) {
  const blockerId = parseBlockerId(req.params.blockerId);
  res.json({ data: await blockerDetail(blockerId, req.user!.id) });
}

async function isManagerAssignable(managerId: number, userId: number): Promise<boolean> {
  const scope = await getManagerScope(managerId);
  const [rows] = await pool.query<Array<RowDataPacket & { id: number }>>(
    `SELECT u.id
     FROM users u
     WHERE u.id = ? AND u.is_active = 1 AND u.role <> 'admin' AND u.is_acc_admin = 0
       AND (? = 1 OR u.department = ? OR EXISTS (
         SELECT 1
         FROM project_members lead_member
         JOIN project_members employee_member ON employee_member.project_id = lead_member.project_id
         WHERE lead_member.user_id = ? AND lead_member.role_in_project <> 'lead'
           AND employee_member.user_id = u.id
       ))
     LIMIT 1`,
    [userId, Number(scope.isAdmin), scope.department, scope.userId],
  );
  return rows.length > 0;
}

function formatBlockerAuditValue(field: string, value: string | null): string {
  return `${field}: ${value ?? '—'}`;
}

export async function updateBlocker(req: Request, res: Response) {
  const blockerId = parseBlockerId(req.params.blockerId);
  const body = req.body as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be an object');
  }
  const version = Number(body.version);
  if (!Number.isSafeInteger(version) || version <= 0) throw new HttpError(400, 'version is required');
  const hasStatus = Object.hasOwn(body, 'status');
  const hasPriority = Object.hasOwn(body, 'priority');
  const hasCategory = Object.hasOwn(body, 'category');
  const hasAssignee = Object.hasOwn(body, 'assigneeId');
  if (!hasStatus && !hasPriority && !hasCategory && !hasAssignee) throw new HttpError(400, 'No blocker changes provided');
  if (hasStatus && (typeof body.status !== 'string' || !BLOCKER_STATUSES.includes(body.status as BlockerStatus))) {
    throw new HttpError(400, 'Invalid blocker status');
  }
  if (hasPriority && (typeof body.priority !== 'string' || !BLOCKER_PRIORITIES.includes(body.priority as BlockerPriority))) {
    throw new HttpError(400, 'Invalid blocker priority');
  }
  if (hasCategory && (typeof body.category !== 'string' || !BLOCKER_CATEGORIES.includes(body.category as BlockerCategory))) {
    throw new HttpError(400, 'Invalid blocker category');
  }
  let nextAssigneeId: number | null | undefined;
  if (hasAssignee) {
    nextAssigneeId = body.assigneeId === null ? null : Number(body.assigneeId);
    if (nextAssigneeId !== null && (!Number.isSafeInteger(nextAssigneeId) || nextAssigneeId <= 0)) {
      throw new HttpError(400, 'assigneeId must be a positive integer or null');
    }
    if (nextAssigneeId !== null && !(await isManagerAssignable(req.user!.id, nextAssigneeId))) {
      throw new HttpError(403, 'Assignee is outside your management scope or is inactive');
    }
  }

  const visible = await getManagedBlocker(blockerId, req.user!.id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [lockedRows] = await connection.query<Array<RowDataPacket & {
      status: BlockerStatus;
      priority: BlockerPriority;
      category: BlockerCategory;
      assigneeId: number | null;
      version: number;
    }>>(
      `SELECT status, priority, category, assignee_user_id AS assigneeId, version
       FROM daily_checkin_blockers WHERE id = ? FOR UPDATE`,
      [blockerId],
    );
    const current = lockedRows[0];
    if (!current) throw new HttpError(404, 'Blocker not found');
    if (Number(current.version) !== version) throw new HttpError(409, 'Blocker was updated by another manager; reload and try again');

    const nextStatus = hasStatus ? body.status as BlockerStatus : current.status;
    const nextPriority = hasPriority ? body.priority as BlockerPriority : current.priority;
    const nextCategory = hasCategory ? body.category as BlockerCategory : current.category;
    const nextAssignee = hasAssignee ? nextAssigneeId! : (current.assigneeId === null ? null : Number(current.assigneeId));
    const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
    if (nextStatus !== current.status) changes.push({ field: 'status', oldValue: current.status, newValue: nextStatus });
    if (nextPriority !== current.priority) changes.push({ field: 'priority', oldValue: current.priority, newValue: nextPriority });
    if (nextCategory !== current.category) changes.push({ field: 'category', oldValue: current.category, newValue: nextCategory });
    if (nextAssignee !== (current.assigneeId === null ? null : Number(current.assigneeId))) {
      const oldName = visible.assigneeName;
      let newName: string | null = null;
      if (nextAssignee !== null) {
        const [assigneeRows] = await connection.query<Array<RowDataPacket & { name: string }>>(
          'SELECT name FROM users WHERE id = ? LIMIT 1',
          [nextAssignee],
        );
        newName = assigneeRows[0]?.name ?? null;
      }
      changes.push({ field: 'assignee', oldValue: oldName, newValue: newName });
    }

    if (changes.length > 0) {
      await connection.query(
        `UPDATE daily_checkin_blockers
         SET status = ?, priority = ?, category = ?, assignee_user_id = ?, version = version + 1,
             resolved_at = CASE WHEN ? = 'RESOLVED' THEN CURRENT_TIMESTAMP ELSE NULL END
         WHERE id = ?`,
        [nextStatus, nextPriority, nextCategory, nextAssignee, nextStatus, blockerId],
      );
      for (const change of changes) {
        await connection.query(
          `INSERT INTO daily_checkin_blocker_history
             (blocker_id, user_id, action_type, old_value, new_value)
           VALUES (?, ?, ?, ?, ?)`,
          [blockerId, req.user!.id, change.field, change.oldValue, change.newValue],
        );
        if (visible.taskId !== null) {
          await connection.query(
            `INSERT INTO task_history (task_id, user_id, action_type, old_value, new_value)
             VALUES (?, ?, 'blocker', ?, ?)`,
            [
              visible.taskId,
              req.user!.id,
              formatBlockerAuditValue(change.field, change.oldValue),
              formatBlockerAuditValue(change.field, change.newValue),
            ],
          );
        }
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.json({ data: await blockerDetail(blockerId, req.user!.id) });
}

export async function addBlockerComment(req: Request, res: Response) {
  const blockerId = parseBlockerId(req.params.blockerId);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 4000) throw new HttpError(400, 'Comment must contain 1 to 4000 characters');
  const blocker = await getManagedBlocker(blockerId, req.user!.id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'INSERT INTO daily_checkin_blocker_comments (blocker_id, user_id, body) VALUES (?, ?, ?)',
      [blockerId, req.user!.id, body],
    );
    await connection.query(
      'UPDATE daily_checkin_blockers SET version = version + 1 WHERE id = ?',
      [blockerId],
    );
    await connection.query(
      `INSERT INTO daily_checkin_blocker_history
         (blocker_id, user_id, action_type, old_value, new_value)
       VALUES (?, ?, 'comment', NULL, ?)`,
      [blockerId, req.user!.id, body],
    );
    if (blocker.taskId !== null) {
      await connection.query(
        `INSERT INTO task_history (task_id, user_id, action_type, old_value, new_value)
         VALUES (?, ?, 'blocker', NULL, ?)`,
        [blocker.taskId, req.user!.id, formatBlockerAuditValue('comment', body)],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.status(201).json({ data: await blockerDetail(blockerId, req.user!.id) });
}

export async function remindEmployee(req: Request, res: Response) {
  const userId = parsePositiveQuery(req.body?.userId, 'userId');
  if (!userId) throw new HttpError(400, 'userId is required');
  const date = parseDate(req.body?.date, 'date');
  const projectId = parsePositiveQuery(req.body?.projectId, 'projectId');
  const [todayRows] = await pool.query<Array<RowDataPacket & { today: string }>>(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today",
  );
  if (date && date !== todayRows[0].today) {
    throw new HttpError(400, 'Reminders can only be sent for today');
  }
  const employees = await employeesForDate(todayRows[0].today, req.user!.id, projectId);
  const employee = employees.find((item) => Number(item.userId) === userId);
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (employee.isComplete) throw new HttpError(409, 'This employee has already completed today’s check-in');

  const [recipientRows] = await pool.query<Array<RowDataPacket & { partnerUserId: number | null }>>(
    `SELECT partner_user_id AS partnerUserId
     FROM users
     WHERE id = ? AND is_active = 1 AND partner_status = 'ACTIVE'
       AND partner_user_id IS NOT NULL AND is_acc_admin = 0 AND role <> 'admin'
     LIMIT 1`,
    [userId],
  );
  const partnerUserId = recipientRows[0]?.partnerUserId;
  if (partnerUserId === null || partnerUserId === undefined) {
    throw new HttpError(409, 'This employee has no eligible Checkin notification account');
  }

  const connection = await pool.getConnection();
  let shouldSend = false;
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.query<Array<RowDataPacket & { status: string }>>(
      'SELECT status FROM daily_checkin_reminders WHERE user_id = ? AND checkin_date = ? FOR UPDATE',
      [userId, todayRows[0].today],
    );
    if (existingRows.length === 0) {
      await connection.query(
        `INSERT INTO daily_checkin_reminders
           (user_id, checkin_date, initiated_by_user_id, status)
         VALUES (?, ?, ?, 'SENDING')`,
        [userId, todayRows[0].today, req.user!.id],
      );
      shouldSend = true;
    } else if (existingRows[0].status === 'FAILED') {
      await connection.query(
        `UPDATE daily_checkin_reminders
         SET initiated_by_user_id = ?, status = 'SENDING'
         WHERE user_id = ? AND checkin_date = ? AND status = 'FAILED'`,
        [req.user!.id, userId, todayRows[0].today],
      );
      shouldSend = true;
    } else if (existingRows[0].status === 'SENDING') {
      const [retryResult] = await connection.query(
        `UPDATE daily_checkin_reminders
         SET initiated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND checkin_date = ? AND status = 'SENDING'
           AND updated_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE)`,
        [req.user!.id, userId, todayRows[0].today],
      );
      shouldSend = 'affectedRows' in retryResult && Number(retryResult.affectedRows) > 0;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (!shouldSend) {
    res.json({ data: { userId, status: 'ALREADY_SENT' } });
    return;
  }
  const requestId = randomUUID();
  const notificationData = {
    type: 'GENERAL_NOTIFICATION',
    screen: 'HOME',
    date: todayRows[0].today,
  };
  await saveNotificationHistory([{
    requestId,
    userId,
    partnerUserId: Number(partnerUserId),
    initiatedByUserId: req.user!.id,
    source: 'DAILY_CHECKIN_REMINDER',
    title: 'Nhắc hoàn tất Daily Check-in',
    body: 'Vui lòng cập nhật tiến độ và kế hoạch công việc hôm nay.',
    data: notificationData,
    deliveryStatus: 'RECORDED',
    deviceCount: 0,
    acceptedDeviceCount: 0,
    errorCode: null,
  }]);
  try {
    await sendNotificationToCheckin({
      userIds: [Number(partnerUserId)],
      title: 'Nhắc hoàn tất Daily Check-in',
      body: 'Vui lòng cập nhật tiến độ và kế hoạch công việc hôm nay.',
      data: notificationData,
    });
  } catch (error) {
    await pool.query(
      `UPDATE daily_checkin_reminders SET status = 'FAILED'
       WHERE user_id = ? AND checkin_date = ?`,
      [userId, todayRows[0].today],
    );
    const candidate = error as { code?: unknown };
    const errorCode = error instanceof HttpError
      ? `CHECKIN_HTTP_${error.status}`
      : typeof candidate.code === 'string'
        ? candidate.code.slice(0, 100)
        : 'CHECKIN_REQUEST_FAILED';
    await updateNotificationHistoryDelivery(requestId, 'FAILED', errorCode);
    throw error;
  }
  await pool.query(
    `UPDATE daily_checkin_reminders SET status = 'SUBMITTED'
     WHERE user_id = ? AND checkin_date = ?`,
    [userId, todayRows[0].today],
  );
  res.json({ data: { userId, status: 'SUBMITTED', requestId } });
}
