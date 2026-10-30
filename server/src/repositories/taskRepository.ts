import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
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
  start_date: string | null;
  estimated_date: string | null;
  due_date: string | null;
  actual_date: string | null;
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
    startDate: row.start_date,
    estimatedDate: row.estimated_date,
    dueDate: row.due_date,
    actualDate: row.actual_date,
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
  assigneeId: 'assignee_user_id',
  startDate: 'start_date',
  estimatedDate: 'estimated_date',
  dueDate: 'due_date',
  actualDate: 'actual_date',
};

export interface TaskFilter {
  status?: TaskStatus;
  assigneeId?: number;
  priority?: TaskPriority;
  projectId?: number;
  userId?: number;
}

export async function listTasks(filter: TaskFilter = {}): Promise<Task[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.status) {
    clauses.push('tasks.status = ?');
    params.push(filter.status);
  }
  if (filter.assigneeId) {
    clauses.push('tasks.assignee_user_id = ?');
    params.push(filter.assigneeId);
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

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.query<TaskRow[]>(
    `SELECT tasks.*, projects.name AS project, COALESCE(users.name, tasks.assignee) AS assignee
     FROM tasks
     LEFT JOIN users ON users.id = tasks.assignee_user_id
     INNER JOIN projects ON projects.id = tasks.project_id
    ${where}
     ORDER BY tasks.id DESC`,
    params,
  );
  return rows.map(mapRow);
}

export async function getTaskById(id: number): Promise<Task | null> {
  const [rows] = await pool.query<TaskRow[]>(
    `SELECT tasks.*, projects.name AS project, COALESCE(users.name, tasks.assignee) AS assignee
     FROM tasks LEFT JOIN users ON users.id = tasks.assignee_user_id
     INNER JOIN projects ON projects.id = tasks.project_id
     WHERE tasks.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getTaskByCode(code: string): Promise<Task | null> {
  const [rows] = await pool.query<TaskRow[]>(
    `SELECT tasks.*, projects.name AS project, COALESCE(users.name, tasks.assignee) AS assignee
     FROM tasks LEFT JOIN users ON users.id = tasks.assignee_user_id
     INNER JOIN projects ON projects.id = tasks.project_id
     WHERE tasks.task_code = ? LIMIT 1`,
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
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO tasks
         (task_code, project_id, project, title, description, status, priority, assignee_user_id, assignee,
          start_date, estimated_date, due_date, actual_date)
        VALUES (?, ?, (SELECT name FROM projects WHERE id = ?), ?, ?, ?, ?, ?, (SELECT name FROM users WHERE id = ?), ?, ?, ?, ?)`,
      [
        input.taskCode,
        input.projectId,
        input.projectId,
        input.title,
        input.description ?? null,
        input.status ?? 'TODO',
        input.priority ?? 'MEDIUM',
        input.assigneeId ?? null,
        input.assigneeId ?? null,
        input.startDate ?? null,
        input.estimatedDate ?? null,
        input.dueDate ?? null,
        input.actualDate ?? null,
      ],
    );
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

    const changes: Array<{ action: string; oldValue: string | null; newValue: string | null }> = [];
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(COLUMN_MAP)) {
      if (key === 'startDate' || !(key in input)) continue;
      const newValue = (input as Record<string, unknown>)[key] ?? null;
      let oldValue: unknown = current[column];

      if (key === 'assigneeId') {
        oldValue = current.assignee;
        let newName: string | null = null;
        if (newValue !== null) {
          const [assignees] = await connection.query<Array<RowDataPacket & { name: string }>>(
            'SELECT name FROM users WHERE id = ?',
            [newValue],
          );
          newName = assignees[0]?.name ?? null;
        }
        if (String(current.assignee_user_id ?? '') !== String(newValue ?? '')) {
          changes.push({ action: key, oldValue: oldValue == null ? null : String(oldValue), newValue: newName });
        }
        sets.push(`${column} = ?`);
        params.push(newValue);
        sets.push('assignee = (SELECT name FROM users WHERE id = ?)');
        params.push(newValue);
        continue;
      }

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
        continue;
      }

      const dateField = ['estimatedDate', 'dueDate', 'actualDate'].includes(key);
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

    if (input.status === 'DONE' && current.actual_date == null && !('actualDate' in input)) {
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
  dataBase64: string;
  userName: string | null;
  createdAt: string;
}

export async function listTaskAttachments(taskId: number): Promise<TaskAttachment[]> {
  const [rows] = await pool.query<Array<RowDataPacket & TaskAttachment>>(
    `SELECT a.id, a.task_id AS taskId, a.file_name AS fileName, a.mime_type AS mimeType,
            REPLACE(REPLACE(TO_BASE64(a.file_data), CHAR(10), ''), CHAR(13), '') AS dataBase64,
            u.name AS userName, a.created_at AS createdAt
     FROM task_attachments a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.task_id = ? ORDER BY a.created_at DESC, a.id DESC`,
    [taskId],
  );
  return rows;
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
      COALESCE(users.name, tasks.assignee, 'Unassigned') AS assignee,
       COUNT(*)                                                                   AS total,
       SUM(status = 'TODO')                                                       AS todo,
       SUM(status = 'IN_PROGRESS')                                                AS inProgress,
       SUM(status = 'DEV_DONE')                                                   AS devDone,
       SUM(status = 'TESTING')                                                    AS testing,
       SUM(status = 'TEST_FAIL')                                                  AS testFail,
       SUM(status = 'DONE')                                                       AS done,
       SUM(status = 'PENDING')                                                    AS pending,
       SUM(status <> 'DONE' AND due_date IS NOT NULL AND due_date < CURDATE())    AS overdue
    FROM tasks
    LEFT JOIN users ON users.id = tasks.assignee_user_id
    ${visibility}
    GROUP BY COALESCE(users.name, tasks.assignee, 'Unassigned')
     ORDER BY total DESC`,
    userId ? [userId] : [],
  );

  return rows.map((r) => {
    const total = Number(r.total);
    const done = Number(r.done);
    return {
      assignee: r.assignee as string,
      total,
      todo: Number(r.todo),
      inProgress: Number(r.inProgress),
      devDone: Number(r.devDone),
      testing: Number(r.testing),
      testFail: Number(r.testFail),
      done,
      pending: Number(r.pending),
      overdue: Number(r.overdue),
      completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });
}
