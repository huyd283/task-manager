import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
import { HttpError } from '../middleware/errorHandler';
import type { CreateTaskInput, Task, TaskPriority, TaskStatus, UpdateTaskInput } from '../types';

interface TaskRow extends RowDataPacket {
  id: number;
  task_code: string;
  project_id: number;
  project: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_user_id: number | null;
  assignee: string | null;
  assignee_ids: string | null;
  assignees: string | null;
  start_date: string | null;
  estimated_date: string | null;
  due_date: string | null;
  actual_date: string | null;
  estimated_time: number | string | null;
  logged_hours: number | string;
  golive_date: string | null;
  acceptance_notes: string | null;
  subtask_progress: number | string;
  sprint_id: number | null;
  created_at: string;
  updated_at: string;
}

/** Maps a snake_case DB row to the camelCase API shape. */
function mapRow(row: TaskRow): Task {
  return {
    id: row.id,
    taskCode: row.task_code,
    projectId: row.project_id,
    project: row.project,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority ?? 'MEDIUM',
    assigneeId: row.assignee_user_id,
    assignee: row.assignee,
    assigneeIds: row.assignee_ids ? row.assignee_ids.split(',').map(Number) : row.assignee_user_id === null ? [] : [row.assignee_user_id],
    assignees: row.assignees ? row.assignees.split('\n') : row.assignee ? [row.assignee] : [],
    startDate: row.start_date,
    estimatedDate: row.estimated_date,
    dueDate: row.due_date,
    actualDate: row.actual_date,
    estimatedHours: row.estimated_time === null ? null : Number(row.estimated_time),
    loggedHours: Number(row.logged_hours ?? 0),
    goliveDate: row.golive_date,
    acceptanceNotes: row.acceptance_notes,
    subtaskProgress: Number(row.subtask_progress ?? 0),
    sprintId: row.sprint_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** camelCase input key -> DB column, used by create/update. */
const COLUMN_MAP: Record<string, string> = {
  taskCode: 'task_code',
  projectId: 'project_id',
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  startDate: 'start_date',
  estimatedDate: 'estimated_date',
  dueDate: 'due_date',
  actualDate: 'actual_date',
  estimatedHours: 'estimated_time',
  loggedHours: 'logged_hours',
  acceptanceNotes: 'acceptance_notes',
};

const TASK_SELECT = `SELECT tasks.*, projects.name AS project,
       COALESCE((SELECT ROUND(100 * SUM(ts.status = 'DONE') / NULLIF(COUNT(*), 0))
                 FROM task_subtasks ts WHERE ts.task_id = tasks.id), 0) AS subtask_progress,
       COALESCE(primary_assignee.name, tasks.assignee) AS assignee,
       (SELECT GROUP_CONCAT(ta.user_id ORDER BY ta.user_id SEPARATOR ',')
        FROM task_assignees ta WHERE ta.task_id = tasks.id) AS assignee_ids,
       (SELECT GROUP_CONCAT(assigned_user.name ORDER BY assigned_user.name SEPARATOR '\\n')
        FROM task_assignees ta
        JOIN users assigned_user ON assigned_user.id = ta.user_id
        WHERE ta.task_id = tasks.id) AS assignees
     FROM tasks
     LEFT JOIN users primary_assignee ON primary_assignee.id = tasks.assignee_user_id
     INNER JOIN projects ON projects.id = tasks.project_id`;

export interface TaskFilter {
  status?: TaskStatus;
  assigneeId?: number;
  priority?: TaskPriority;
  projectId?: number;
  userId?: number;
  dueFrom?: string;
  dueTo?: string;
}

export async function listTasks(filter: TaskFilter = {}): Promise<Task[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.status) {
    clauses.push('tasks.status = ?');
    params.push(filter.status);
  }
  if (filter.assigneeId) {
    clauses.push('(tasks.assignee_user_id = ? OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = ?))');
    params.push(filter.assigneeId, filter.assigneeId);
  }
  if (filter.priority) {
    clauses.push('tasks.priority = ?');
    params.push(filter.priority);
  }
  if (filter.projectId) {
    clauses.push('tasks.project_id = ?');
    params.push(filter.projectId);
  }
  if (filter.userId) {
    clauses.push('EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = tasks.project_id AND pm.user_id = ?)');
    params.push(filter.userId);
  }
  if (filter.dueFrom) {
    clauses.push('tasks.due_date >= ?');
    params.push(filter.dueFrom);
  }
  if (filter.dueTo) {
    clauses.push('tasks.due_date <= ?');
    params.push(filter.dueTo);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.query<TaskRow[]>(
    `${TASK_SELECT}
    ${where}
     ORDER BY tasks.id DESC`,
    params,
  );
  return rows.map(mapRow);
}

export async function getTaskById(id: number): Promise<Task | null> {
  const [rows] = await pool.query<TaskRow[]>(
    `${TASK_SELECT} WHERE tasks.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getTaskByCode(code: string): Promise<Task | null> {
  const [rows] = await pool.query<TaskRow[]>(
    `${TASK_SELECT} WHERE tasks.task_code = ? LIMIT 1`,
    [code],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Generates the next sequential task code, e.g. "TASK-0007". */
export async function nextTaskCode(prefix = 'TASK'): Promise<string> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT task_code FROM tasks
     WHERE task_code REGEXP '^[A-Za-z]+-[0-9]+$'
     ORDER BY CAST(SUBSTRING_INDEX(task_code, '-', -1) AS UNSIGNED) DESC
     LIMIT 1`,
  );
  const last = rows[0]?.task_code as string | undefined;
  const lastNum = last ? Number(last.split('-').pop()) : 0;
  return `${prefix}-${String(lastNum + 1).padStart(4, '0')}`;
}

export async function createTask(input: CreateTaskInput & { taskCode: string }, userId: number): Promise<Task> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const assigneeIds = input.assigneeIds ?? (input.assigneeId === null || input.assigneeId === undefined ? [] : [input.assigneeId]);
    const primaryAssigneeId = assigneeIds[0] ?? null;
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO tasks
         (task_code, project_id, project, title, description, status, priority, assignee_user_id, assignee,
          start_date, estimated_date, due_date, actual_date, estimated_time, logged_hours)
        VALUES (?, ?, (SELECT name FROM projects WHERE id = ?), ?, ?, ?, ?, ?, (SELECT name FROM users WHERE id = ?), ?, ?, ?, ?, ?, ?)`,
      [
        input.taskCode,
        input.projectId,
        input.projectId,
        input.title,
        input.description ?? null,
        input.status ?? 'TODO',
        input.priority ?? 'MEDIUM',
        primaryAssigneeId,
        primaryAssigneeId,
        input.startDate ?? null,
        input.estimatedDate ?? null,
        input.dueDate ?? null,
        input.actualDate ?? null,
        input.estimatedHours ?? null,
        input.loggedHours ?? 0,
      ],
    );
    if (assigneeIds.length > 0) {
      await connection.query(
        `INSERT INTO task_assignees (task_id, user_id) VALUES ${assigneeIds.map(() => '(?, ?)').join(',')}`,
        assigneeIds.flatMap((assigneeId) => [result.insertId, assigneeId]),
      );
    }
    await connection.query(
      'INSERT INTO task_history (task_id, user_id, action_type, new_value) VALUES (?, ?, ?, ?)',
      [result.insertId, userId, 'created', `${input.taskCode}: ${input.title}`],
    );
    await connection.commit();
    const created = await getTaskById(result.insertId);
    return created as Task;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export interface TaskHistoryEntry {
  id: number;
  taskId: number;
  userId: number | null;
  userName: string | null;
  actionType: string;
  oldValue: string | null;
  newValue: string | null;
  timestamp: string;
}

export async function updateTask(id: number, input: UpdateTaskInput, userId: number): Promise<Task | null> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<Array<RowDataPacket & Record<string, unknown>>>(
      'SELECT * FROM tasks WHERE id = ? FOR UPDATE',
      [id],
    );
    const current = rows[0];
    if (!current) {
      await connection.commit();
      return null;
    }
    const dateValue = (value: unknown) => value == null ? null : String(value).slice(0, 10);
    const dateChanges = (['startDate', 'dueDate'] as const).some(
      (field) => field in input &&
        dateValue(input[field]) !== dateValue(current[field === 'startDate' ? 'start_date' : 'due_date']),
    );
    const staysTodo = current.status === 'TODO' && (input.status === undefined || input.status === 'TODO');
    const returnsToTodo = current.status === 'PENDING' && input.status === 'TODO';
    if (dateChanges && !staysTodo && !returnsToTodo) {
      throw new HttpError(400, 'Start date and due date can only be changed while the task is TODO');
    }
    if (input.status === 'REVIEW' || input.status === 'DONE' || input.status === 'GOLIVE') {
      const [incomplete] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM task_subtasks WHERE task_id = ? AND status <> 'DONE' LIMIT 1 FOR UPDATE",
        [id],
      );
      if (incomplete.length > 0) {
        throw new HttpError(409, 'Complete all subtasks before moving the task to Review or completion');
      }
    }

    const changes: Array<{ action: string; oldValue: string | null; newValue: string | null }> = [];
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(COLUMN_MAP)) {
      if (key === 'assigneeId' || !(key in input)) continue;
      const newValue = (input as Record<string, unknown>)[key] ?? null;
      let oldValue: unknown = current[column];

      if (key === 'projectId') {
        oldValue = current.project;
        const [projects] = await connection.query<Array<RowDataPacket & { name: string }>>(
          'SELECT name FROM projects WHERE id = ?',
          [newValue],
        );
        const newName = projects[0]?.name ?? null;
        if (String(current.project_id) !== String(newValue)) {
          changes.push({ action: key, oldValue: oldValue == null ? null : String(oldValue), newValue: newName });
        }
        sets.push(`${column} = ?`);
        params.push(newValue);
        if (String(current.project_id) !== String(newValue)) sets.push('sprint_id = NULL');
        continue;
      }

      const dateField = ['startDate', 'estimatedDate', 'dueDate', 'actualDate'].includes(key);
      const normalize = (value: unknown) => value == null ? null : dateField ? String(value).slice(0, 10) : String(value);
      if (normalize(oldValue) !== normalize(newValue)) {
        changes.push({
          action: key,
          oldValue: oldValue == null ? null : String(oldValue),
          newValue: newValue == null ? null : String(newValue),
        });
      }
      sets.push(`${column} = ?`);
      params.push(newValue);
    }

    const requestedAssigneeIds = input.assigneeIds ??
      (input.assigneeId === undefined ? undefined : input.assigneeId === null ? [] : [input.assigneeId]);
    if (requestedAssigneeIds !== undefined) {
      const assigneeIds = [...new Set(requestedAssigneeIds)];
      const [oldAssigneeRows] = await connection.query<Array<RowDataPacket & { name: string }>>(
        `SELECT u.name FROM task_assignees ta JOIN users u ON u.id = ta.user_id
         WHERE ta.task_id = ? ORDER BY u.name`,
        [id],
      );
      const oldNames = oldAssigneeRows.length > 0
        ? oldAssigneeRows.map((row) => row.name)
        : current.assignee ? [String(current.assignee)] : [];
      let newAssigneeRows: Array<RowDataPacket & { id: number; name: string }> = [];
      if (assigneeIds.length > 0) {
        const [rows] = await connection.query<Array<RowDataPacket & { id: number; name: string }>>(
          `SELECT id, name FROM users WHERE id IN (${assigneeIds.map(() => '?').join(',')}) ORDER BY name`,
          assigneeIds,
        );
        newAssigneeRows = rows;
      }
      const namesById = new Map(newAssigneeRows.map((row) => [Number(row.id), row.name]));
      const newNames = assigneeIds.map((assigneeId) => namesById.get(assigneeId)).filter((name): name is string => Boolean(name));
      if (JSON.stringify([...oldNames].sort()) !== JSON.stringify([...newNames].sort())) {
        changes.push({
          action: 'assigneeIds',
          oldValue: oldNames.length > 0 ? oldNames.join(', ') : null,
          newValue: newNames.length > 0 ? newNames.join(', ') : null,
        });
      }

      await connection.query('DELETE FROM task_assignees WHERE task_id = ?', [id]);
      if (assigneeIds.length > 0) {
        await connection.query(
          `INSERT INTO task_assignees (task_id, user_id) VALUES ${assigneeIds.map(() => '(?, ?)').join(',')}`,
          assigneeIds.flatMap((assigneeId) => [id, assigneeId]),
        );
      }
      const primaryAssigneeId = assigneeIds[0] ?? null;
      sets.push('assignee_user_id = ?', 'assignee = ?');
      params.push(primaryAssigneeId, primaryAssigneeId === null ? null : namesById.get(primaryAssigneeId) ?? null);
    }

    if (input.status === 'GOLIVE' && current.golive_date == null) {
      sets.push('golive_date = CURDATE()');
      changes.push({ action: 'goliveDate', oldValue: null, newValue: new Date().toISOString().slice(0, 10) });
    } else if (input.status !== 'GOLIVE' && current.golive_date != null) {
      sets.push('golive_date = NULL');
    }

    if ((input.status === 'DONE' || input.status === 'GOLIVE') && current.actual_date == null && !('actualDate' in input)) {
      const [todayRows] = await connection.query<Array<RowDataPacket & { today: string }>>(
        "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today",
      );
      changes.push({ action: 'actualDate', oldValue: null, newValue: todayRows[0].today });
      sets.push('actual_date = CURDATE()');
    }

    if (sets.length > 0) {
      params.push(id);
      await connection.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params);
      for (const change of changes) {
        await connection.query(
          'INSERT INTO task_history (task_id, user_id, action_type, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
          [id, userId, change.action, change.oldValue, change.newValue],
        );
      }
    }

    await connection.commit();
    return getTaskById(id);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateTaskStatus(id: number, status: TaskStatus, userId: number): Promise<Task | null> {
  return updateTask(id, { status }, userId);
}

export async function getTaskHistory(taskId: number): Promise<TaskHistoryEntry[]> {
  const [rows] = await pool.query<Array<RowDataPacket & TaskHistoryEntry>>(
    `SELECT h.id, h.task_id AS taskId, h.user_id AS userId, u.name AS userName,
            h.action_type AS actionType, h.old_value AS oldValue, h.new_value AS newValue,
            h.\`timestamp\` AS timestamp
     FROM task_history h LEFT JOIN users u ON u.id = h.user_id
     WHERE h.task_id = ? ORDER BY h.\`timestamp\` DESC, h.id DESC`,
    [taskId],
  );
  return rows;
}

export interface TaskAttachment {
  id: number;
  taskId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataBase64: string;
  userName: string | null;
  createdAt: string;
}

export async function listTaskAttachments(taskId: number): Promise<TaskAttachment[]> {
  const [rows] = await pool.query<Array<RowDataPacket & TaskAttachment>>(
    `SELECT a.id, a.task_id AS taskId, a.file_name AS fileName, a.mime_type AS mimeType,
            OCTET_LENGTH(a.file_data) AS fileSize,
            REPLACE(REPLACE(TO_BASE64(a.file_data), CHAR(10), ''), CHAR(13), '') AS dataBase64,
            u.name AS userName, a.created_at AS createdAt
     FROM task_attachments a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.task_id = ? ORDER BY a.created_at DESC, a.id DESC`,
    [taskId],
  );
  return rows.map((row) => ({ ...row, fileSize: Number(row.fileSize) }));
}

export async function getTaskAttachment(
  taskId: number,
  attachmentId: number,
): Promise<{ fileName: string; mimeType: string; fileData: Buffer } | null> {
  const [rows] = await pool.query<Array<RowDataPacket & { fileName: string; mimeType: string; fileData: Buffer }>>(
    `SELECT file_name AS fileName, mime_type AS mimeType, file_data AS fileData
     FROM task_attachments WHERE task_id = ? AND id = ? LIMIT 1`,
    [taskId, attachmentId],
  );
  return rows[0] ?? null;
}

export async function createTaskAttachment(
  taskId: number,
  userId: number,
  fileName: string,
  mimeType: string,
  fileData: Buffer,
): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'INSERT INTO task_attachments (task_id, user_id, file_name, mime_type, file_data) VALUES (?, ?, ?, ?, ?)',
      [taskId, userId, fileName, mimeType, fileData],
    );
    await connection.query(
      'INSERT INTO task_history (task_id, user_id, action_type, new_value) VALUES (?, ?, ?, ?)',
      [taskId, userId, 'attachment_added', fileName],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteTaskAttachment(taskId: number, attachmentId: number): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM task_attachments WHERE id = ? AND task_id = ?',
    [attachmentId, taskId],
  );
  return result.affectedRows > 0;
}

export async function deleteTask(id: number): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM tasks WHERE id = ?',
    [id],
  );
  return result.affectedRows > 0;
}

export async function taskIsInProject(id: number, projectId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1',
    [id, projectId],
  );
  return rows.length > 0;
}

export interface AssigneeStat {
  assignee: string;
  total: number;
  todo: number;
  inProgress: number;
  devDone: number;
  testing: number;
  testFail: number;
  done: number;
  review: number;
  golive: number;
  estimatedHours: number;
  loggedHours: number;
  pending: number;
  overdue: number;
  completionRate: number;
}

/**
 * Report: aggregates task counts per assignee, including how many are
 * overdue (past due date and not done) and a completion percentage.
 */
export async function getStatsByAssignee(userId?: number): Promise<AssigneeStat[]> {
  const visibility = userId
    ? 'WHERE EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = tasks.project_id AND pm.user_id = ?)'
    : '';
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      COALESCE(assigned_user.name, tasks.assignee, 'Unassigned') AS assignee,
       COUNT(DISTINCT tasks.id) AS total,
       COUNT(DISTINCT CASE WHEN tasks.status = 'TODO' THEN tasks.id END) AS todo,
       COUNT(DISTINCT CASE WHEN tasks.status = 'IN_PROGRESS' THEN tasks.id END) AS inProgress,
       COUNT(DISTINCT CASE WHEN tasks.status = 'DEV_DONE' THEN tasks.id END) AS devDone,
       COUNT(DISTINCT CASE WHEN tasks.status = 'TESTING' THEN tasks.id END) AS testing,
       COUNT(DISTINCT CASE WHEN tasks.status = 'TEST_FAIL' THEN tasks.id END) AS testFail,
       COUNT(DISTINCT CASE WHEN tasks.status = 'DONE' THEN tasks.id END) AS done,
       COUNT(DISTINCT CASE WHEN tasks.status = 'REVIEW' THEN tasks.id END) AS review,
       COUNT(DISTINCT CASE WHEN tasks.status = 'GOLIVE' THEN tasks.id END) AS golive,
       SUM(tasks.estimated_time) AS estimatedHours,
       SUM(tasks.logged_hours) AS loggedHours,
       COUNT(DISTINCT CASE WHEN tasks.status = 'PENDING' THEN tasks.id END) AS pending,
       COUNT(DISTINCT CASE WHEN tasks.status NOT IN ('DONE','GOLIVE') AND tasks.due_date IS NOT NULL AND tasks.due_date < CURDATE() THEN tasks.id END) AS overdue
    FROM tasks
    LEFT JOIN task_assignees ta ON ta.task_id = tasks.id
    LEFT JOIN users assigned_user ON assigned_user.id = COALESCE(ta.user_id, tasks.assignee_user_id)
    ${visibility}
    GROUP BY COALESCE(assigned_user.name, tasks.assignee, 'Unassigned')
     ORDER BY total DESC`,
    userId ? [userId] : [],
  );

  return rows.map((r) => {
    const total = Number(r.total);
    const done = Number(r.done);
    const golive = Number(r.golive);
    return {
      assignee: r.assignee as string,
      total,
      todo: Number(r.todo),
      inProgress: Number(r.inProgress),
      devDone: Number(r.devDone),
      testing: Number(r.testing),
      testFail: Number(r.testFail),
      done,
      review: Number(r.review),
      golive,
      estimatedHours: Number(r.estimatedHours ?? 0),
      loggedHours: Number(r.loggedHours ?? 0),
      pending: Number(r.pending),
      overdue: Number(r.overdue),
      completionRate: total > 0 ? Math.round((golive / total) * 100) : 0,
    };
  });
}
