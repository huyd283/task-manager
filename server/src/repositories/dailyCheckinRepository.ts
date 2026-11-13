import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
import { HttpError } from '../middleware/errorHandler';
import type { TaskStatus } from '../types';

export type BlockerStatus = 'NONE' | 'BLOCKED';
export type BlockerImpact = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DailyCheckinInput {
  reviewedTaskIds: number[];
  reviewConfirmed: boolean;
  plannedTaskIds: number[];
  planConfirmed: boolean;
  blockerStatus: BlockerStatus | null;
  blockerDescription: string | null;
  blockerTaskId: number | null;
  blockerImpact: BlockerImpact | null;
  complete: boolean;
  statusUpdates: Array<{
    taskId: number;
    status: TaskStatus;
    startDate?: string;
    dueDate?: string;
  }>;
}

interface CheckinRow extends RowDataPacket {
  id: number | string;
  reviewedTaskIds: string;
  reviewConfirmed: number;
  planConfirmed: number;
  blockerStatus: BlockerStatus | null;
  blockerDescription: string | null;
  blockerTaskId: number | null;
  blockerImpact: BlockerImpact | null;
  isComplete: number;
  completedAt: string | null;
  savedAt: string;
}

const ALLOWED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'PENDING'],
  IN_PROGRESS: ['DEV_DONE', 'PENDING'],
  DEV_DONE: ['TESTING', 'IN_PROGRESS'],
  TESTING: ['REVIEW', 'DONE', 'TEST_FAIL'],
  TEST_FAIL: ['IN_PROGRESS', 'TESTING'],
  REVIEW: ['DONE', 'TEST_FAIL'],
  DONE: ['GOLIVE', 'REVIEW'],
  GOLIVE: [],
  PENDING: ['TODO', 'IN_PROGRESS'],
};

function uniqueIds(ids: number[]): number[] {
  return [...new Set(ids)];
}

async function assertAssignedTasks(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  userId: number,
  taskIds: number[],
): Promise<void> {
  if (taskIds.length === 0) return;
  const [rows] = await connection.query<Array<RowDataPacket & { id: number }>>(
    `SELECT t.id FROM tasks t
     WHERE t.deleted_at IS NULL
       AND t.id IN (${taskIds.map(() => '?').join(',')})
       AND (
         t.assignee_user_id = ?
         OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)
       )`,
    [...taskIds, userId, userId],
  );
  if (rows.length !== taskIds.length) {
    throw new HttpError(403, 'Check-in tasks must be assigned to your account');
  }
}

async function updateTaskStatus(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  userId: number,
  taskId: number,
  update: DailyCheckinInput['statusUpdates'][number],
): Promise<void> {
  const { status } = update;
  const [rows] = await connection.query<Array<RowDataPacket & {
    status: TaskStatus;
    start_date: string | null;
    due_date: string | null;
    actual_date: string | null;
    completed_at: string | null;
    golive_date: string | null;
    logged_hours: number | string;
    acceptance_notes: string | null;
    require_logged_time: number;
  }>>(
    `SELECT t.status, t.start_date, t.due_date, t.actual_date, t.completed_at, t.golive_date,
            t.logged_hours, t.acceptance_notes, p.require_logged_time
     FROM tasks t JOIN projects p ON p.id = t.project_id
     WHERE t.id = ? AND t.deleted_at IS NULL
       AND (t.assignee_user_id = ? OR EXISTS (
         SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?
       ))
     FOR UPDATE`,
    [taskId, userId, userId],
  );
  const task = rows[0];
  if (!task) throw new HttpError(403, 'Task is no longer assigned to your account');
  if (task.status === status) return;
  if (!ALLOWED_TRANSITIONS[task.status].includes(status)) {
    throw new HttpError(409, `Cannot transition task from ${task.status} to ${status}`);
  }
  const nextStartDate = update.startDate ?? (task.start_date ? String(task.start_date).slice(0, 10) : null);
  const nextDueDate = update.dueDate ?? (task.due_date ? String(task.due_date).slice(0, 10) : null);
  if (status === 'IN_PROGRESS' && (!nextStartDate || !nextDueDate)) {
    throw new HttpError(400, 'Add both a start date and a due date before moving this task to In Progress');
  }
  if (status === 'REVIEW' || status === 'DONE' || status === 'GOLIVE') {
    const [subtasks] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM task_subtasks WHERE task_id = ? AND status <> 'DONE' LIMIT 1 FOR UPDATE",
      [taskId],
    );
    if (subtasks.length > 0) {
      throw new HttpError(409, 'Complete all subtasks before moving the task to Review or completion');
    }
    if (Boolean(task.require_logged_time) && Number(task.logged_hours) <= 0 && !task.acceptance_notes?.trim()) {
      throw new HttpError(409, 'Log time or add acceptance notes before completing this task');
    }
  }

  const sets = ['status = ?'];
  const params: unknown[] = [status];
  const historyChanges: Array<{ action: string; oldValue: string | null; newValue: string | null }> = [
    { action: 'status', oldValue: task.status, newValue: status },
  ];
  if (status === 'DONE') {
    const [dateRows] = await connection.query<Array<RowDataPacket & { today: string; completedAt: string }>>(
      "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today, DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS completedAt",
    );
    sets.push('actual_date = CURDATE()', 'completed_at = CURRENT_TIMESTAMP');
    historyChanges.push(
      { action: 'actualDate', oldValue: null, newValue: dateRows[0].today },
      { action: 'completedAt', oldValue: null, newValue: dateRows[0].completedAt },
    );
  } else if (task.status === 'DONE' && status !== 'GOLIVE') {
    sets.push('actual_date = NULL', 'completed_at = NULL');
    historyChanges.push(
      { action: 'actualDate', oldValue: task.actual_date == null ? null : String(task.actual_date), newValue: null },
      { action: 'completedAt', oldValue: task.completed_at == null ? null : String(task.completed_at), newValue: null },
    );
  }
  if (status === 'GOLIVE' && task.golive_date == null) {
    sets.push('golive_date = CURDATE()');
    historyChanges.push({ action: 'goliveDate', oldValue: null, newValue: new Date().toISOString().slice(0, 10) });
  } else if (status !== 'GOLIVE' && task.golive_date != null) {
    sets.push('golive_date = NULL');
    historyChanges.push({ action: 'goliveDate', oldValue: String(task.golive_date), newValue: null });
  }
  if (update.startDate && update.startDate !== nextStartDate) {
    sets.push('start_date = ?');
    params.push(update.startDate);
    historyChanges.push({
      action: 'startDate',
      oldValue: task.start_date == null ? null : String(task.start_date).slice(0, 10),
      newValue: update.startDate,
    });
  }
  if (update.dueDate && update.dueDate !== nextDueDate) {
    sets.push('due_date = ?');
    params.push(update.dueDate);
    historyChanges.push({
      action: 'dueDate',
      oldValue: task.due_date == null ? null : String(task.due_date).slice(0, 10),
      newValue: update.dueDate,
    });
  }
  params.push(taskId);
  await connection.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params);
  for (const change of historyChanges) {
    await connection.query(
      'INSERT INTO task_history (task_id, user_id, action_type, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
      [taskId, userId, change.action, change.oldValue, change.newValue],
    );
  }
}

export async function loadTodayCheckin(userId: number): Promise<Record<string, unknown> | null> {
  const [rows] = await pool.query<CheckinRow[]>(
    `SELECT id, reviewed_task_ids AS reviewedTaskIds, review_confirmed AS reviewConfirmed,
            plan_confirmed AS planConfirmed, blocker_status AS blockerStatus,
            blocker_description AS blockerDescription, blocker_task_id AS blockerTaskId,
            blocker_impact AS blockerImpact, is_complete AS isComplete,
            completed_at AS completedAt, updated_at AS savedAt
     FROM daily_checkins WHERE user_id = ? AND checkin_date = CURDATE() LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  const [plannedRows] = await pool.query<Array<RowDataPacket & { taskId: number }>>(
    'SELECT task_id AS taskId FROM daily_checkin_tasks WHERE user_id = ? AND checkin_date = CURDATE() ORDER BY position, task_id',
    [userId],
  );
  let reviewedTaskIds: number[] = [];
  try {
    const parsed: unknown = JSON.parse(row.reviewedTaskIds);
    if (Array.isArray(parsed)) reviewedTaskIds = parsed.map(Number).filter(Number.isInteger);
  } catch {
    throw new Error('Stored Daily Check-in has invalid reviewed task data');
  }
  return {
    reviewedTaskIds,
    reviewConfirmed: Boolean(row.reviewConfirmed),
    plannedTaskIds: plannedRows.map((item) => Number(item.taskId)),
    planConfirmed: Boolean(row.planConfirmed),
    blockerStatus: row.blockerStatus,
    blockerDescription: row.blockerDescription,
    blockerTaskId: row.blockerTaskId === null ? null : Number(row.blockerTaskId),
    blockerImpact: row.blockerImpact,
    isComplete: Boolean(row.isComplete),
    completedAt: row.completedAt,
    savedAt: row.savedAt,
  };
}

export async function saveTodayCheckin(userId: number, input: DailyCheckinInput): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const reviewedTaskIds = uniqueIds(input.reviewedTaskIds);
    const plannedTaskIds = uniqueIds(input.plannedTaskIds);
    const statusTaskIds = input.statusUpdates.map((item) => item.taskId);
    if (input.reviewConfirmed || input.complete) {
      const [assignedRows] = await connection.query<Array<RowDataPacket & { id: number }>>(
        `SELECT t.id FROM tasks t
         WHERE t.deleted_at IS NULL
           AND (t.assignee_user_id = ? OR EXISTS (
             SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?
           ))`,
        [userId, userId],
      );
      const reviewed = new Set(reviewedTaskIds);
      if (assignedRows.some((task) => !reviewed.has(Number(task.id)))) {
        throw new HttpError(400, 'Confirm the review of all currently assigned tasks');
      }
    }
    await assertAssignedTasks(connection, userId, uniqueIds([
      ...reviewedTaskIds,
      ...plannedTaskIds,
      ...statusTaskIds,
      ...(input.blockerTaskId === null ? [] : [input.blockerTaskId]),
    ]));
    if (input.complete && (!input.reviewConfirmed || !input.planConfirmed || !input.blockerStatus)) {
      throw new HttpError(400, 'Complete all three check-in steps before submitting');
    }

    for (const update of input.statusUpdates) {
      await updateTaskStatus(connection, userId, update.taskId, update);
    }

    await connection.query(
      `INSERT INTO daily_checkins
         (user_id, checkin_date, reviewed_task_ids, review_confirmed, plan_confirmed,
          blocker_status, blocker_description, blocker_task_id, blocker_impact, is_complete, completed_at)
       VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, IF(?, CURRENT_TIMESTAMP, NULL))
       ON DUPLICATE KEY UPDATE
         reviewed_task_ids = VALUES(reviewed_task_ids),
         review_confirmed = VALUES(review_confirmed),
         plan_confirmed = VALUES(plan_confirmed),
         blocker_status = VALUES(blocker_status),
         blocker_description = VALUES(blocker_description),
         blocker_task_id = VALUES(blocker_task_id),
         blocker_impact = VALUES(blocker_impact),
         is_complete = VALUES(is_complete),
         completed_at = IF(VALUES(is_complete) = 1, COALESCE(completed_at, CURRENT_TIMESTAMP), NULL)`,
      [
        userId,
        JSON.stringify(reviewedTaskIds),
        Number(input.reviewConfirmed),
        Number(input.planConfirmed),
        input.blockerStatus,
        input.blockerStatus === 'BLOCKED' ? input.blockerDescription : null,
        input.blockerStatus === 'BLOCKED' ? input.blockerTaskId : null,
        input.blockerStatus === 'BLOCKED' ? input.blockerImpact : null,
        Number(input.complete),
        Number(input.complete),
      ],
    );
    await connection.query(
      'DELETE FROM daily_checkin_tasks WHERE user_id = ? AND checkin_date = CURDATE()',
      [userId],
    );
    if (plannedTaskIds.length > 0) {
      await connection.query(
        `INSERT INTO daily_checkin_tasks (user_id, checkin_date, task_id, position)
         VALUES ${plannedTaskIds.map(() => '(?, CURDATE(), ?, ?)').join(',')}`,
        plannedTaskIds.flatMap((taskId, index) => [userId, taskId, index]),
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listVisibleBlockers(
  role: string,
  isAccAdmin: boolean,
  jobTitle: string,
  department: string | null,
): Promise<Array<Record<string, unknown>>> {
  const admin = role === 'admin' || isAccAdmin;
  const lead = jobTitle === 'Project Lead';
  if (!admin && !lead) throw new HttpError(403, 'Only administrators and department leads can view blockers');
  if (!admin && !department?.trim()) {
    throw new HttpError(403, 'A department must be assigned to your account to view blockers');
  }
  const [rows] = await pool.query<Array<RowDataPacket & Record<string, unknown>>>(
    `SELECT c.id, c.checkin_date AS checkinDate, c.blocker_description AS description,
            c.blocker_impact AS impact, c.blocker_task_id AS taskId,
            u.id AS userId, u.name AS userName, u.department,
            t.task_code AS taskCode, t.title AS taskTitle, p.name AS projectName
     FROM daily_checkins c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN tasks t ON t.id = c.blocker_task_id
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE c.checkin_date = CURDATE() AND c.blocker_status = 'BLOCKED'
       AND c.is_complete = 1 AND (? = 1 OR u.department = ?)
     ORDER BY FIELD(c.blocker_impact, 'HIGH', 'MEDIUM', 'LOW'), c.updated_at DESC`,
    [Number(admin), department],
  );
  return rows;
}
