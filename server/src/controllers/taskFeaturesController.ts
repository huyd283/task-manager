import type { Request, Response } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
import { HttpError } from '../middleware/errorHandler';
import * as projectRepo from '../repositories/projectRepository';
import * as taskRepo from '../repositories/taskRepository';
import * as userRepo from '../repositories/userRepository';

function idParam(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function canManageTasks(req: Request) {
  return req.user?.role === 'admin' || req.user?.isAccAdmin === true || req.user?.jobTitle === 'Project Lead';
}

async function taskForUser(req: Request, rawId = req.params.id) {
  const task = await taskRepo.getTaskById(idParam(rawId));
  if (!task) throw new HttpError(404, 'Task not found');
  if (!canManageTasks(req) &&
    !(await projectRepo.isProjectMember(task.projectId, req.user!.id))) {
    throw new HttpError(404, 'Task not found');
  }
  return task;
}

async function projectForUser(req: Request, rawId = req.params.projectId) {
  const projectId = idParam(rawId);
  if (!(await projectRepo.projectExists(projectId))) throw new HttpError(404, 'Project not found');
  if (!canManageTasks(req) &&
    !(await projectRepo.isProjectMember(projectId, req.user!.id))) {
    throw new HttpError(404, 'Project not found');
  }
  return projectId;
}

export async function listComments(req: Request, res: Response) {
  const task = await taskForUser(req);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.task_id AS taskId, c.user_id AS userId, u.name AS userName,
            u.username, c.body, c.created_at AS createdAt, c.updated_at AS updatedAt
     FROM task_comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.task_id = ? ORDER BY c.created_at, c.id`,
    [task.id],
  );
  res.json({ data: rows });
}

export async function createComment(req: Request, res: Response) {
  const task = await taskForUser(req);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 20000) throw new HttpError(400, 'Comment must contain 1 to 20000 characters');
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, ?)',
    [task.id, req.user!.id, body],
  );
  res.status(201).json({ data: { id: result.insertId, taskId: task.id, userId: req.user!.id, body } });
}

export async function updateComment(req: Request, res: Response) {
  const task = await taskForUser(req);
  const commentId = idParam(req.params.commentId);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 20000) throw new HttpError(400, 'Comment must contain 1 to 20000 characters');
  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE task_comments SET body = ? WHERE id = ? AND task_id = ? AND user_id = ?',
    [body, commentId, task.id, req.user!.id],
  );
  if (!result.affectedRows) throw new HttpError(404, 'Comment not found or not editable');
  res.json({ data: { id: commentId, taskId: task.id, userId: req.user!.id, body } });
}

export async function deleteComment(req: Request, res: Response) {
  const task = await taskForUser(req);
  const commentId = idParam(req.params.commentId);
  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM task_comments WHERE id = ? AND task_id = ? AND user_id = ?',
    [commentId, task.id, req.user!.id],
  );
  if (!result.affectedRows) throw new HttpError(404, 'Comment not found or not deletable');
  res.status(204).send();
}

export async function listSubtasks(req: Request, res: Response) {
  const task = await taskForUser(req);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id, s.task_id AS taskId, s.title, s.assignee_user_id AS assigneeId,
            u.name AS assignee, s.status, s.estimated_hours AS estimatedHours,
            s.created_at AS createdAt, s.updated_at AS updatedAt
     FROM task_subtasks s LEFT JOIN users u ON u.id = s.assignee_user_id
     WHERE s.task_id = ? ORDER BY s.id`,
    [task.id],
  );
  const total = rows.length;
  const completed = rows.filter((row) => row.status === 'DONE').length;
  res.json({ data: rows, progress: total ? Math.round((completed / total) * 100) : 0 });
}

export async function createSubtask(req: Request, res: Response) {
  const task = await taskForUser(req);
  if (['REVIEW', 'DONE', 'GOLIVE'].includes(task.status)) {
    throw new HttpError(409, 'Cannot add a subtask after the task has entered review or completion');
  }
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const assigneeId = req.body?.assigneeId == null || req.body.assigneeId === '' ? null : Number(req.body.assigneeId);
  const estimatedHours = req.body?.estimatedHours == null || req.body.estimatedHours === '' ? null : Number(req.body.estimatedHours);
  if (!title || title.length > 255) throw new HttpError(400, 'Subtask title is required (maximum 255 characters)');
  if (assigneeId !== null && (!Number.isInteger(assigneeId) ||
    !(await userRepo.isAssignableUser(assigneeId)) ||
    !(await projectRepo.isProjectMember(task.projectId, assigneeId)))) {
    throw new HttpError(400, 'Subtask assignee must be an active member of the task project');
  }
  if (estimatedHours !== null && (!Number.isFinite(estimatedHours) || estimatedHours < 0)) {
    throw new HttpError(400, 'estimatedHours must be a non-negative number');
  }
  const connection = await pool.getConnection();
  let subtaskId: number;
  try {
    await connection.beginTransaction();
    const [parent] = await connection.query<Array<RowDataPacket & { status: string }>>(
      'SELECT status FROM tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [task.id],
    );
    if (!parent[0]) throw new HttpError(404, 'Task not found');
    if (['REVIEW', 'DONE', 'GOLIVE'].includes(parent[0].status)) {
      throw new HttpError(409, 'Cannot add a subtask after the task has entered review or completion');
    }
    const [result] = await connection.query<ResultSetHeader>(
      'INSERT INTO task_subtasks (task_id, title, assignee_user_id, estimated_hours) VALUES (?, ?, ?, ?)',
      [task.id, title, assigneeId, estimatedHours],
    );
    subtaskId = result.insertId;
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.status(201).json({ data: { id: subtaskId, taskId: task.id, title, assigneeId, estimatedHours, status: 'TODO' } });
}

export async function updateSubtask(req: Request, res: Response) {
  const task = await taskForUser(req);
  const subtaskId = idParam(req.params.subtaskId);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (['REVIEW', 'DONE', 'GOLIVE'].includes(task.status) && body.status !== undefined && body.status !== 'DONE') {
    throw new HttpError(409, 'Subtasks cannot be reopened after the task has entered review or completion');
  }
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 255) throw new HttpError(400, 'Invalid subtask title');
    fields.push('title = ?');
    values.push(body.title.trim());
  }
  if (body.status !== undefined) {
    if (!['TODO', 'IN_PROGRESS', 'DONE'].includes(String(body.status))) throw new HttpError(400, 'Invalid subtask status');
    fields.push('status = ?');
    values.push(body.status);
  }
  if (body.assigneeId !== undefined) {
    const assigneeId = body.assigneeId == null || body.assigneeId === '' ? null : Number(body.assigneeId);
    if (assigneeId !== null && (!Number.isInteger(assigneeId) ||
      !(await userRepo.isAssignableUser(assigneeId)) ||
      !(await projectRepo.isProjectMember(task.projectId, assigneeId)))) {
      throw new HttpError(400, 'Subtask assignee must be an active member of the task project');
    }
    fields.push('assignee_user_id = ?');
    values.push(assigneeId);
  }
  if (body.estimatedHours !== undefined) {
    const hours = body.estimatedHours == null || body.estimatedHours === '' ? null : Number(body.estimatedHours);
    if (hours !== null && (!Number.isFinite(hours) || hours < 0)) throw new HttpError(400, 'Invalid estimatedHours');
    fields.push('estimated_hours = ?');
    values.push(hours);
  }
  if (fields.length === 0) throw new HttpError(400, 'No subtask fields provided');
  values.push(subtaskId, task.id);
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE task_subtasks SET ${fields.join(', ')} WHERE id = ? AND task_id = ?`,
    values,
  );
  if (!result.affectedRows) throw new HttpError(404, 'Subtask not found');
  res.json({ data: { id: subtaskId, ...body } });
}

export async function deleteSubtask(req: Request, res: Response) {
  const task = await taskForUser(req);
  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM task_subtasks WHERE id = ? AND task_id = ?',
    [idParam(req.params.subtaskId), task.id],
  );
  if (!result.affectedRows) throw new HttpError(404, 'Subtask not found');
  res.status(204).send();
}

export async function listSprints(req: Request, res: Response) {
  const projectId = await projectForUser(req);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id, s.project_id AS projectId, s.name, s.start_date AS startDate,
            s.end_date AS endDate, s.goal, s.status,
            COUNT(CASE WHEN t.status <> 'DONE' THEN t.id END) AS taskCount
     FROM sprints s LEFT JOIN tasks t ON t.sprint_id = s.id AND t.deleted_at IS NULL
     WHERE s.project_id = ? GROUP BY s.id ORDER BY s.start_date DESC`,
    [projectId],
  );
  res.json({ data: rows });
}

export async function createSprint(req: Request, res: Response) {
  const projectId = await projectForUser(req);
  const { name, startDate, endDate, goal } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) throw new HttpError(400, 'Sprint name is required');
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) {
    throw new HttpError(400, 'Sprint dates must be valid and endDate must not precede startDate');
  }
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO sprints (project_id, name, start_date, end_date, goal, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [projectId, name.trim(), startDate, endDate, typeof goal === 'string' ? goal.trim() || null : null, req.user!.id],
  );
  res.status(201).json({ data: { id: result.insertId, projectId, name: name.trim(), startDate, endDate, goal: goal ?? null, status: 'PLANNING' } });
}

export async function updateSprintStatus(req: Request, res: Response) {
  const projectId = await projectForUser(req);
  const sprintId = idParam(req.params.sprintId);
  const status = req.body?.status;
  if (!['ACTIVE', 'COMPLETED'].includes(status)) throw new HttpError(400, 'status must be ACTIVE or COMPLETED');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT id FROM projects WHERE id = ? FOR UPDATE', [projectId]);
    const [rows] = await connection.query<Array<RowDataPacket & { status: string }>>(
      'SELECT status FROM sprints WHERE id = ? AND project_id = ? FOR UPDATE',
      [sprintId, projectId],
    );
    if (!rows[0]) throw new HttpError(404, 'Sprint not found');
    if (status === 'ACTIVE' && rows[0].status !== 'PLANNING') throw new HttpError(409, 'Only a planning sprint can be started');
    if (status === 'ACTIVE') {
      const [active] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM sprints WHERE project_id = ? AND status = 'ACTIVE' AND id <> ? LIMIT 1",
        [projectId, sprintId],
      );
      if (active.length) throw new HttpError(409, 'This project already has an active sprint');
    }
    if (status === 'COMPLETED' && rows[0].status !== 'ACTIVE') throw new HttpError(409, 'Only an active sprint can be completed');
    await connection.query('UPDATE sprints SET status = ? WHERE id = ?', [status, sprintId]);
    if (status === 'COMPLETED') {
      await connection.query("UPDATE tasks SET sprint_id = NULL WHERE sprint_id = ? AND deleted_at IS NULL AND status NOT IN ('DONE', 'GOLIVE')", [sprintId]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.json({ data: { id: sprintId, status } });
}

export async function assignSprintTask(req: Request, res: Response) {
  const projectId = await projectForUser(req);
  const sprintId = idParam(req.params.sprintId);
  const taskId = Number(req.body?.taskId);
  if (!Number.isInteger(taskId) || taskId <= 0) throw new HttpError(400, 'taskId must be a positive integer');
  const [sprints] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM sprints WHERE id = ? AND project_id = ? AND status IN ('PLANNING','ACTIVE')",
    [sprintId, projectId],
  );
  if (!sprints.length) throw new HttpError(404, 'Open sprint not found');
  const [result] = await pool.query<ResultSetHeader>(
    "UPDATE tasks SET sprint_id = ? WHERE id = ? AND project_id = ? AND deleted_at IS NULL AND status <> 'GOLIVE'",
    [sprintId, taskId, projectId],
  );
  if (!result.affectedRows) throw new HttpError(404, 'Task not found or already Golive');
  res.json({ data: { taskId, sprintId } });
}

export async function removeSprintTask(req: Request, res: Response) {
  const projectId = await projectForUser(req);
  const sprintId = idParam(req.params.sprintId);
  const taskId = Number(req.params.taskId);
  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE tasks SET sprint_id = NULL WHERE id = ? AND project_id = ? AND sprint_id = ? AND deleted_at IS NULL',
    [taskId, projectId, sprintId],
  );
  if (!result.affectedRows) throw new HttpError(404, 'Sprint task not found');
  res.status(204).send();
}

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function exportTasks(req: Request, res: Response) {
  const projectId = req.query.projectId === undefined ? undefined : Number(req.query.projectId);
  if (projectId !== undefined) {
    if (!Number.isInteger(projectId) || projectId <= 0) throw new HttpError(400, 'Invalid projectId');
    await projectForUser(req, String(projectId));
  }
  const clauses = ['1 = 1'];
  const params: unknown[] = [];
  if (projectId !== undefined) { clauses.push('t.project_id = ?'); params.push(projectId); }
  if (req.query.sprintId !== undefined) {
    const sprintId = Number(req.query.sprintId);
    if (!Number.isInteger(sprintId) || sprintId <= 0) throw new HttpError(400, 'Invalid sprintId');
    clauses.push('t.sprint_id = ?'); params.push(sprintId);
  }
  if (req.query.from !== undefined) {
    if (!validDate(req.query.from)) throw new HttpError(400, 'from must be a valid YYYY-MM-DD date');
    clauses.push('t.created_at >= ?');
    params.push(req.query.from);
  }
  if (req.query.to !== undefined) {
    if (!validDate(req.query.to)) throw new HttpError(400, 'to must be a valid YYYY-MM-DD date');
    if (typeof req.query.from === 'string' && req.query.to < req.query.from) throw new HttpError(400, 'to must not precede from');
    clauses.push('t.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(req.query.to);
  }
  if (req.query.assigneeId !== undefined) {
    const assigneeId = Number(req.query.assigneeId);
    if (!Number.isInteger(assigneeId) || assigneeId <= 0) throw new HttpError(400, 'Invalid assigneeId');
    clauses.push('EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)');
    params.push(assigneeId);
  }
  if (!canManageTasks(req)) {
    clauses.push('EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = ?)');
    params.push(req.user!.id);
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.task_code, t.title, p.name AS project, s.name AS sprint,
            GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', ') AS assignees,
            t.status, t.priority, t.estimated_time, t.logged_hours, t.start_date, t.golive_date
     FROM tasks t JOIN projects p ON p.id = t.project_id
     LEFT JOIN sprints s ON s.id = t.sprint_id
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     LEFT JOIN users u ON u.id = ta.user_id
     WHERE t.deleted_at IS NULL AND ${clauses.join(' AND ')}
     GROUP BY t.id ORDER BY t.id`,
    params,
  );
  const columns = ['Task ID', 'Tên Task', 'Dự án', 'Sprint', 'Người thực hiện', 'Trạng thái', 'Mức độ ưu tiên', 'Estimated Hours', 'Logged Hours', 'Ngày bắt đầu', 'Ngày Golive'];
  const lines = [columns, ...rows.map((row) => [
    row.task_code, row.title, row.project, row.sprint, row.assignees, row.status, row.priority,
    row.estimated_time, row.logged_hours, row.start_date, row.golive_date,
  ])].map((line) => line.map(csvCell).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="task-report.csv"');
  res.send(`\uFEFF${lines.join('\r\n')}`);
}

export async function projectMembers(req: Request, res: Response) {
  const projectId = await projectForUser(req);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.name, u.username, u.email, u.employee_code AS employeeCode,
            u.department, u.job_title AS jobTitle
     FROM project_members pm JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ? AND u.is_active = 1 ORDER BY u.name`,
    [projectId],
  );
  res.json({ data: rows });
}
