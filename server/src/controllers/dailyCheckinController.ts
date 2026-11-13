import type { Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
import { HttpError } from '../middleware/errorHandler';
import {
  listVisibleBlockers,
  loadTodayCheckin,
  saveTodayCheckin,
  type BlockerImpact,
  type BlockerStatus,
  type DailyCheckinInput,
} from '../repositories/dailyCheckinRepository';
import { listTasks } from '../repositories/taskRepository';
import { TASK_STATUSES, type TaskStatus } from '../types';

function parseIds(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length > 500 ||
    value.some((id) => !Number.isInteger(id) || Number(id) <= 0)) {
    throw new HttpError(400, `${field} must be an array of positive task ids`);
  }
  return [...new Set(value as number[])];
}

function validDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${field} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

function parseInput(body: unknown): DailyCheckinInput {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'A check-in payload is required');
  const value = body as Record<string, unknown>;
  if (typeof value.reviewConfirmed !== 'boolean' || typeof value.planConfirmed !== 'boolean') {
    throw new HttpError(400, 'Review and plan confirmation values are required');
  }
  if (value.blockerStatus !== null && value.blockerStatus !== 'NONE' && value.blockerStatus !== 'BLOCKED') {
    throw new HttpError(400, 'blockerStatus must be NONE or BLOCKED');
  }
  if (typeof value.complete !== 'boolean') throw new HttpError(400, 'complete must be a boolean');
  const blockerStatus = value.blockerStatus as BlockerStatus | null;
  const blockerDescription = typeof value.blockerDescription === 'string'
    ? value.blockerDescription.trim()
    : '';
  let blockerTaskId: number | null = null;
  if (value.blockerTaskId !== null && value.blockerTaskId !== undefined && value.blockerTaskId !== '') {
    blockerTaskId = Number(value.blockerTaskId);
    if (!Number.isInteger(blockerTaskId) || blockerTaskId <= 0) {
      throw new HttpError(400, 'blockerTaskId must be a positive task id');
    }
  }
  let blockerImpact: BlockerImpact | null = null;
  if (value.blockerImpact !== null && value.blockerImpact !== undefined) {
    if (value.blockerImpact !== 'LOW' && value.blockerImpact !== 'MEDIUM' && value.blockerImpact !== 'HIGH') {
      throw new HttpError(400, 'blockerImpact must be LOW, MEDIUM, or HIGH');
    }
    blockerImpact = value.blockerImpact;
  }
  if (blockerStatus === 'BLOCKED' && (!blockerDescription || blockerDescription.length > 2000 || !blockerImpact)) {
    throw new HttpError(400, 'Describe the blocker (up to 2000 characters) and choose its impact');
  }
  if (blockerStatus !== 'BLOCKED' && (blockerTaskId !== null || blockerImpact !== null)) {
    throw new HttpError(400, 'Blocker details can only be sent when a blocker is selected');
  }
  if (blockerStatus !== 'BLOCKED' && blockerDescription) {
    throw new HttpError(400, 'Blocker details can only be sent when a blocker is selected');
  }

  if (!Array.isArray(value.statusUpdates)) throw new HttpError(400, 'statusUpdates must be an array');
  if (value.statusUpdates.length > 500) throw new HttpError(400, 'statusUpdates cannot contain more than 500 tasks');
  const statusUpdates = value.statusUpdates.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new HttpError(400, 'Each status update must be an object');
    const update = entry as Record<string, unknown>;
    const taskId = Number(update.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) throw new HttpError(400, 'Invalid status update task id');
    if (typeof update.status !== 'string' || !TASK_STATUSES.includes(update.status as TaskStatus)) {
      throw new HttpError(400, 'Invalid task status');
    }
    const hasStartDate = Object.hasOwn(update, 'startDate');
    const hasDueDate = Object.hasOwn(update, 'dueDate');
    if (hasStartDate !== hasDueDate) {
      throw new HttpError(400, 'Both startDate and dueDate must be provided together');
    }
    if (hasStartDate && update.status !== 'IN_PROGRESS') {
      throw new HttpError(400, 'Dates can only be updated while starting a task');
    }
    return {
      taskId,
      status: update.status as TaskStatus,
      ...(hasStartDate ? {
        startDate: validDate(update.startDate, 'startDate'),
        dueDate: validDate(update.dueDate, 'dueDate'),
      } : {}),
    };
  });
  if (new Set(statusUpdates.map((item) => item.taskId)).size !== statusUpdates.length) {
    throw new HttpError(400, 'A task can only have one status update');
  }

  return {
    reviewedTaskIds: parseIds(value.reviewedTaskIds, 'reviewedTaskIds'),
    reviewConfirmed: value.reviewConfirmed,
    plannedTaskIds: parseIds(value.plannedTaskIds, 'plannedTaskIds'),
    planConfirmed: value.planConfirmed,
    blockerStatus,
    blockerDescription: blockerStatus === 'BLOCKED' ? blockerDescription : null,
    blockerTaskId: blockerStatus === 'BLOCKED' ? blockerTaskId : null,
    blockerImpact: blockerStatus === 'BLOCKED' ? blockerImpact : null,
    complete: value.complete,
    statusUpdates,
  };
}

export async function getToday(req: Request, res: Response) {
  const [dateRows, tasks, checkin] = await Promise.all([
    pool.query<Array<RowDataPacket & { today: string }>>(
      "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today",
    ),
    listTasks({ assigneeId: req.user!.id }),
    loadTodayCheckin(req.user!.id),
  ]);
  res.json({ data: { date: dateRows[0][0].today, tasks, checkin } });
}

export async function save(req: Request, res: Response) {
  const input = parseInput(req.body);
  await saveTodayCheckin(req.user!.id, input);
  const checkin = await loadTodayCheckin(req.user!.id);
  res.json({ data: checkin });
}

export async function blockers(req: Request, res: Response) {
  const [rows] = await pool.query<Array<RowDataPacket & {
    role: string;
    is_acc_admin: number;
    job_title: string;
    department: string | null;
  }>>(
    'SELECT role, is_acc_admin, job_title, department FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
    [req.user!.id],
  );
  const user = rows[0];
  if (!user) throw new HttpError(401, 'Authenticated user no longer exists');
  const data = await listVisibleBlockers(
    user.role,
    Boolean(user.is_acc_admin),
    user.job_title,
    user.department,
  );
  res.json({ data });
}
