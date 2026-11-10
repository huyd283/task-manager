import type { Request, Response } from 'express';
import { HttpError } from '../middleware/errorHandler';
import * as taskRepo from '../repositories/taskRepository';
import * as userRepo from '../repositories/userRepository';
import * as projectRepo from '../repositories/projectRepository';
import { TASK_PRIORITIES, TASK_STATUSES, type Task, type TaskPriority, type TaskStatus } from '../types';
import { pool } from '../config/db';
import type { RowDataPacket } from 'mysql2';

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'Invalid task id');
  }
  return id;
}

function assertStatus(status: unknown): TaskStatus {
  if (typeof status !== 'string' || !TASK_STATUSES.includes(status as TaskStatus)) {
    throw new HttpError(400, `status must be one of: ${TASK_STATUSES.join(', ')}`);
  }
  return status as TaskStatus;
}

function assertPriority(priority: unknown): TaskPriority {
  if (typeof priority !== 'string' || !TASK_PRIORITIES.includes(priority as TaskPriority)) {
    throw new HttpError(400, `priority must be one of: ${TASK_PRIORITIES.join(', ')}`);
  }
  return priority as TaskPriority;
}

function assertDateFilter(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${field} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

function parseAssigneeIds(body: Record<string, unknown>, isPresent: boolean): number[] | undefined {
  if (!isPresent) return undefined;
  if (Object.hasOwn(body, 'assigneeIds')) {
    if (!Array.isArray(body.assigneeIds) || body.assigneeIds.some((id) => !Number.isInteger(id) || Number(id) <= 0)) {
      throw new HttpError(400, 'assigneeIds must contain positive user ids');
    }
    return [...new Set(body.assigneeIds as number[])];
  }
  if (body.assigneeId === null || body.assigneeId === '') return [];
  const id = body.assigneeId;
  if (!Number.isInteger(id) || Number(id) <= 0) {
    throw new HttpError(400, 'assigneeIds must be an array of positive user ids');
  }
  return [Number(id)];
}

function canManageProjects(req: Request) {
  return req.user?.role === 'admin' || req.user?.jobTitle === 'Project Lead';
}

async function assertProjectAccess(req: Request, projectId: number) {
  if (!(await projectRepo.projectExists(projectId))) throw new HttpError(400, 'Project does not exist');
  if (!canManageProjects(req) && !(await projectRepo.isProjectMember(projectId, req.user!.id))) {
    throw new HttpError(403, 'You are not a member of this project');
  }
}

async function assertTaskAccess(req: Request, task: Task) {
  if (!canManageProjects(req) && !(await projectRepo.isProjectMember(task.projectId, req.user!.id))) {
    throw new HttpError(404, 'Task not found');
  }
}

async function assertAssigneesAreActive(ids: number[] | undefined, projectId: number) {
  if (!ids) return;
  for (const id of ids) {
    if (!(await userRepo.isAssignableUser(id))) {
      throw new HttpError(400, 'All assignees must be active users in the system');
    }
    if (!(await projectRepo.isProjectMember(projectId, id))) {
      throw new HttpError(400, 'All assignees must be members of the selected project');
    }
  }
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

async function validateStatusTransition(
  existing: Task,
  status: TaskStatus,
  taskId: number,
  proposedHours?: number,
  proposedAcceptance?: string | null,
) {
  if (status === existing.status) return;
  if (!ALLOWED_TRANSITIONS[existing.status].includes(status)) {
    throw new HttpError(409, `Cannot transition task from ${existing.status} to ${status}`);
  }
  if (status === 'IN_PROGRESS' && (!existing.startDate || !existing.dueDate)) {
    throw new HttpError(400, 'Add both a start date and a due date before moving this task to In Progress');
  }
  if (status === 'REVIEW' || status === 'DONE' || status === 'GOLIVE') {
    const [rows] = await pool.query<Array<RowDataPacket & { remaining: number }>>(
      "SELECT COUNT(*) AS remaining FROM task_subtasks WHERE task_id = ? AND status <> 'DONE'",
      [taskId],
    );
    if (Number(rows[0]?.remaining ?? 0) > 0) {
      throw new HttpError(409, 'Complete all subtasks before moving the task to Review or Done');
    }
  }
  if (status === 'REVIEW' || status === 'DONE' || status === 'GOLIVE') {
    const [rows] = await pool.query<Array<RowDataPacket & { require_logged_time: number; acceptance_notes: string | null }>>(
      `SELECT p.require_logged_time, t.acceptance_notes
       FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ?`,
      [taskId],
    );
    const requiresLogged = Boolean(rows[0]?.require_logged_time);
    const acceptance = proposedAcceptance === undefined ? rows[0]?.acceptance_notes : proposedAcceptance;
    if (requiresLogged && (proposedHours ?? existing.loggedHours) <= 0 && !acceptance?.trim()) {
      throw new HttpError(409, 'Log time or add acceptance notes before completing this task');
    }
  }
}

export async function list(req: Request, res: Response) {
  const { status, assigneeId, priority, projectId, scope, dueFrom, dueTo } = req.query;
  const filter: taskRepo.TaskFilter = {};

  if (status) filter.status = assertStatus(status);
  if (typeof assigneeId === 'string') {
    const parsedAssigneeId = Number(assigneeId);
    if (!Number.isInteger(parsedAssigneeId) || parsedAssigneeId <= 0) throw new HttpError(400, 'Invalid assignee id');
    filter.assigneeId = parsedAssigneeId;
  }
  if (priority) filter.priority = assertPriority(priority);
  if (dueFrom !== undefined) filter.dueFrom = assertDateFilter(dueFrom, 'dueFrom');
  if (dueTo !== undefined) filter.dueTo = assertDateFilter(dueTo, 'dueTo');
  if (filter.dueFrom && filter.dueTo && filter.dueFrom > filter.dueTo) {
    throw new HttpError(400, 'dueFrom must not be later than dueTo');
  }
  if (typeof projectId === 'string') {
    const parsedProjectId = Number(projectId);
    if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0) throw new HttpError(400, 'Invalid project id');
    filter.projectId = parsedProjectId;
  }
  if (scope === 'projects' && typeof scope === 'string') filter.userId = req.user?.id;
  else if (!canManageProjects(req)) filter.userId = req.user?.id;

  const tasks = await taskRepo.listTasks(filter);
  res.json({ data: tasks, count: tasks.length });
}

export async function getOne(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const task = await taskRepo.getTaskById(id);
  if (!task) throw new HttpError(404, 'Task not found');
  await assertTaskAccess(req, task);
  res.json({ data: task });
}

export async function create(req: Request, res: Response) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (Object.hasOwn(body, 'actualDate') && body.actualDate !== null) {
    throw new HttpError(400, 'Completion date is recorded automatically when the task is marked Done');
  }
  if (!body.title || typeof body.title !== 'string') {
    throw new HttpError(400, 'title is required');
  }
  const projectId = Number(body.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) throw new HttpError(400, 'projectId is required');
  await assertProjectAccess(req, projectId);
  if (body.status !== undefined) assertStatus(body.status);
  if (body.status !== undefined && body.status !== 'TODO') {
    throw new HttpError(400, 'New tasks must start in To Do');
  }
  for (const dateField of ['startDate', 'estimatedDate', 'dueDate'] as const) {
    if (!Object.hasOwn(body, dateField)) continue;
    body[dateField] = body[dateField] === '' || body[dateField] === null
      ? null
      : assertDateFilter(body[dateField], dateField);
  }
  if (body.priority !== undefined) assertPriority(body.priority);
  if (body.estimatedHours !== undefined && body.estimatedHours !== null &&
    (typeof body.estimatedHours !== 'number' || !Number.isFinite(body.estimatedHours) || body.estimatedHours < 0)) {
    throw new HttpError(400, 'estimatedHours must be a non-negative number');
  }
  const assigneeIds = parseAssigneeIds(body, Object.hasOwn(body, 'assigneeIds') || Object.hasOwn(body, 'assigneeId')) ?? [];
  await assertAssigneesAreActive(assigneeIds, projectId);

  let taskCode = typeof body.taskCode === 'string' && body.taskCode.trim()
    ? body.taskCode.trim()
    : undefined;

  if (!taskCode) {
    taskCode = await taskRepo.nextTaskCode();
  } else if (await taskRepo.getTaskByCode(taskCode)) {
    throw new HttpError(409, `Task code ${taskCode} already exists`);
  }

  const task = await taskRepo.createTask(
    { ...body, projectId, assigneeIds, assigneeId: assigneeIds[0] ?? null, taskCode } as Parameters<typeof taskRepo.createTask>[0],
    req.user!.id,
  );
  res.status(201).json({ data: task });
}

export async function update(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const existing = await taskRepo.getTaskById(id);
  if (!existing) throw new HttpError(404, 'Task not found');
  await assertTaskAccess(req, existing);

  const body = { ...(req.body ?? {}) };
  if (Object.hasOwn(body, 'actualDate') && body.actualDate !== null) {
    throw new HttpError(400, 'Completion date is recorded automatically when the task is marked Done');
  }
  delete body.actualDate;
  for (const dateField of ['estimatedDate'] as const) {
    if (Object.hasOwn(body, dateField)) {
      const requestedDate = body[dateField] === '' ? null : body[dateField];
      if (requestedDate !== existing[dateField]) {
        throw new HttpError(400, `${dateField} cannot be changed after task creation`);
      }
      delete body[dateField];
    }
  }
  const proposedStatus = body.status === undefined ? existing.status : assertStatus(body.status);
  for (const dateField of ['startDate', 'dueDate'] as const) {
    if (!Object.hasOwn(body, dateField)) continue;
    const rawDate = body[dateField];
    const requestedDate = rawDate === '' || rawDate === null
      ? null
      : assertDateFilter(rawDate, dateField);
    const currentDate = existing[dateField]?.slice(0, 10) ?? null;
    if (requestedDate !== currentDate && proposedStatus !== 'TODO') {
      throw new HttpError(400, `${dateField} can only be changed while the task is TODO`);
    }
    body[dateField] = requestedDate;
  }
  if (body.projectId !== undefined) {
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId) || projectId <= 0) throw new HttpError(400, 'projectId must be a positive project id');
    body.projectId = projectId;
  }
  const targetProjectId = body.projectId === undefined ? existing.projectId : body.projectId as number;
  await assertProjectAccess(req, targetProjectId);
  if (body.status !== undefined) assertStatus(body.status);
  if (body.status !== undefined) {
    await validateStatusTransition(
      existing,
      body.status,
      id,
      typeof body.loggedHours === 'number' ? body.loggedHours : undefined,
      typeof body.acceptanceNotes === 'string' || body.acceptanceNotes === null ? body.acceptanceNotes : undefined,
    );
  }
  if (body.priority !== undefined) assertPriority(body.priority);
  if (body.estimatedHours !== undefined && body.estimatedHours !== null &&
    (typeof body.estimatedHours !== 'number' || !Number.isFinite(body.estimatedHours) || body.estimatedHours < 0)) {
    throw new HttpError(400, 'estimatedHours must be a non-negative number');
  }
  if (body.loggedHours !== undefined &&
    (typeof body.loggedHours !== 'number' || !Number.isFinite(body.loggedHours) || body.loggedHours < 0)) {
    throw new HttpError(400, 'loggedHours must be a non-negative number');
  }
  if (body.acceptanceNotes !== undefined && body.acceptanceNotes !== null &&
    (typeof body.acceptanceNotes !== 'string' || body.acceptanceNotes.length > 20000)) {
    throw new HttpError(400, 'acceptanceNotes must be 20000 characters or fewer');
  }
  const hasAssignees = Object.hasOwn(body, 'assigneeIds') || Object.hasOwn(body, 'assigneeId');
  const assigneeIds = parseAssigneeIds(body, hasAssignees);
  await assertAssigneesAreActive(assigneeIds, targetProjectId);
  if (assigneeIds !== undefined) {
    body.assigneeIds = assigneeIds;
    delete body.assigneeId;
  }

  // Required columns must not be blanked out.
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) {
    throw new HttpError(400, 'title cannot be empty');
  }
  if (typeof body.taskCode === 'string' && body.taskCode.trim()) {
    body.taskCode = body.taskCode.trim();
    if (body.taskCode !== existing.taskCode) {
      const dup = await taskRepo.getTaskByCode(body.taskCode);
      if (dup) throw new HttpError(409, `Task code ${body.taskCode} already exists`);
    }
  } else {
    // Empty/omitted code => keep the existing one unchanged.
    delete body.taskCode;
  }

  const task = await taskRepo.updateTask(id, body, req.user!.id);
  res.json({ data: task });
}

export async function updateStatus(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const status = assertStatus((req.body ?? {}).status);

  const existing = await taskRepo.getTaskById(id);
  if (!existing) throw new HttpError(404, 'Task not found');
  await assertTaskAccess(req, existing);

  await validateStatusTransition(existing, status, id);
  const task = await taskRepo.updateTaskStatus(id, status, req.user!.id);
  res.json({ data: task });
}

export async function history(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const task = await taskRepo.getTaskById(id);
  if (!task) throw new HttpError(404, 'Task not found');
  await assertTaskAccess(req, task);
  const data = await taskRepo.getTaskHistory(id);
  res.json({ data });
}

const ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ATTACHMENT_EXTENSIONS: Record<string, readonly string[]> = {
  'image/jpeg': ['.jpg', '.jpeg', '.jpe', '.jfif'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt', '.text', '.log', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.ini', '.cfg'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function attachments(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const task = await taskRepo.getTaskById(id);
  if (!task) throw new HttpError(404, 'Task not found');
  await assertTaskAccess(req, task);
  res.json({ data: await taskRepo.listTaskAttachments(id) });
}

export async function addAttachment(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const task = await taskRepo.getTaskById(id);
  if (!task) throw new HttpError(404, 'Task not found');
  await assertTaskAccess(req, task);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const fileName = typeof body.fileName === 'string' ? body.fileName.split(/[\\/]/).pop()?.trim() ?? '' : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase() : '';
  const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : '';
  if (!fileName || fileName.length > 255) throw new HttpError(400, 'A valid fileName is required');
  if (!ATTACHMENT_MIME_TYPES.has(mimeType)) throw new HttpError(400, 'Unsupported attachment file type');
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  if (!ATTACHMENT_EXTENSIONS[mimeType]?.includes(extension)) {
    throw new HttpError(400, 'File extension does not match the declared MIME type');
  }
  if (!dataBase64 || dataBase64.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataBase64)) {
    throw new HttpError(400, 'Invalid attachment data');
  }
  const fileData = Buffer.from(dataBase64, 'base64');
  if (fileData.length === 0 || fileData.length > MAX_ATTACHMENT_BYTES) {
    throw new HttpError(400, 'Attachments must be 8 MB or smaller');
  }
  if (mimeType.startsWith('image/') && fileData.length >= MAX_IMAGE_BYTES) {
    throw new HttpError(400, 'Images must be smaller than 5 MB');
  }

  await taskRepo.createTaskAttachment(id, req.user!.id, fileName, mimeType, fileData);
  res.status(201).json({ data: await taskRepo.listTaskAttachments(id) });
}

export async function downloadAttachment(req: Request, res: Response) {
  const taskId = parseId(req.params.id);
  const attachmentId = parseId(req.params.attachmentId);
  const task = await taskRepo.getTaskById(taskId);
  if (!task) throw new HttpError(404, 'Task not found');
  await assertTaskAccess(req, task);

  const attachment = await taskRepo.getTaskAttachment(taskId, attachmentId);
  if (!attachment) throw new HttpError(404, 'Attachment not found');
  const fallbackName = attachment.fileName.replace(/[^A-Za-z0-9._-]/g, '_') || 'attachment';
  const encodedName = encodeURIComponent(attachment.fileName).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Length', attachment.fileData.length);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(attachment.fileData);
}

export async function deleteAttachment(req: Request, res: Response) {
  const taskId = parseId(req.params.id);
  const attachmentId = parseId(req.params.attachmentId);
  const task = await taskRepo.getTaskById(taskId);
  if (!task) throw new HttpError(404, 'Task not found');
  await assertTaskAccess(req, task);
  const deleted = await taskRepo.deleteTaskAttachment(taskId, attachmentId);
  if (!deleted) throw new HttpError(404, 'Attachment not found');
  res.status(204).send();
}

export async function remove(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw new HttpError(403, 'Only administrators can delete tasks');
  }
  const id = parseId(req.params.id);
  const existing = await taskRepo.getTaskById(id);
  if (!existing) throw new HttpError(404, 'Task not found');
  await assertTaskAccess(req, existing);
  const ok = await taskRepo.deleteTask(id, req.user.id);
  if (!ok) throw new HttpError(404, 'Task not found');
  res.status(204).send();
}

export async function stats(req: Request, res: Response) {
  const data = await taskRepo.getStatsByAssignee(canManageProjects(req) ? undefined : req.user?.id);
  res.json({ data });
}
