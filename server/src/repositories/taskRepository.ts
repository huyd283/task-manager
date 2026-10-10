import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
import type { CreateTaskInput, Task, TaskStatus, UpdateTaskInput } from '../types';

interface TaskRow extends RowDataPacket {
  id: number;
  task_code: string;
  project_id: number;
  project: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
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
  assigneeId: 'assignee_user_id',
  startDate: 'start_date',
  estimatedDate: 'estimated_date',
  dueDate: 'due_date',
  actualDate: 'actual_date',
};

export interface TaskFilter {
  status?: TaskStatus;
  assignee?: string;
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
  if (filter.assignee) {
    clauses.push('tasks.assignee = ?');
    params.push(filter.assignee);
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

export async function createTask(input: CreateTaskInput & { taskCode: string }): Promise<Task> {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO tasks
       (task_code, project_id, project, title, description, status, assignee_user_id, assignee,
        start_date, estimated_date, due_date, actual_date)
      VALUES (?, ?, (SELECT name FROM projects WHERE id = ?), ?, ?, ?, ?, (SELECT name FROM users WHERE id = ?), ?, ?, ?, ?)`,
    [
      input.taskCode,
      input.projectId,
      input.projectId,
      input.title,
      input.description ?? null,
      input.status ?? 'TODO',
      input.assigneeId ?? null,
      input.assigneeId ?? null,
      input.startDate ?? null,
      input.estimatedDate ?? null,
      input.dueDate ?? null,
      input.actualDate ?? null,
    ],
  );
  const created = await getTaskById(result.insertId);
  // Non-null: the row was just inserted.
  return created as Task;
}

export async function updateTask(id: number, input: UpdateTaskInput): Promise<Task | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, column] of Object.entries(COLUMN_MAP)) {
    if (key in input) {
      sets.push(`${column} = ?`);
      params.push((input as Record<string, unknown>)[key] ?? null);
    }
  }

  if ('assigneeId' in input) {
    sets.push('assignee = (SELECT name FROM users WHERE id = ?)');
    params.push(input.assigneeId ?? null);
  }

  if (sets.length === 0) return getTaskById(id);

  params.push(id);
  await pool.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params);
  return getTaskById(id);
}

export async function updateTaskStatus(id: number, status: TaskStatus): Promise<Task | null> {
  // When a task first moves to DONE, stamp actual_date with today's date.
  await pool.query(
    `UPDATE tasks
     SET status = ?,
         actual_date = CASE
           WHEN ? = 'DONE' AND actual_date IS NULL THEN CURDATE()
           ELSE actual_date
         END
     WHERE id = ?`,
    [status, status, id],
  );
  return getTaskById(id);
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
  inReview: number;
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
       SUM(status = 'IN_REVIEW')                                                  AS inReview,
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
      inReview: Number(r.inReview),
      done,
      pending: Number(r.pending),
      overdue: Number(r.overdue),
      completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });
}
