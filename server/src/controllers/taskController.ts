import type { Request, Response } from 'express';
import { HttpError } from '../middleware/errorHandler';
import * as taskRepo from '../repositories/taskRepository';
import * as userRepo from '../repositories/userRepository';
import * as projectRepo from '../repositories/projectRepository';
import { TASK_PRIORITIES, TASK_STATUSES, type Task, type TaskPriority, type TaskStatus } from '../types';

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

function parseAssigneeId(value: unknown, isPresent: boolean): number | null | undefined {
  if (!isPresent) return undefined;
  if (value === null || value === '') return null;
  const id = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'assigneeId must be a positive user id or null');
  }
  return id;
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

async function assertAssigneeIsActive(id: number | null | undefined) {
  if (id !== undefined && id !== null && !(await userRepo.isAssignableUser(id))) {
    throw new HttpError(400, 'Assignee must be an active user in the system');
  }
}

export async function list(req: Request, res: Response) {
  const { status, assigneeId, priority, projectId, scope } = req.query;
  const filter: taskRepo.TaskFilter = {};

  if (status) filter.status = assertStatus(status);
  if (typeof assigneeId === 'string') {
    const parsedAssigneeId = Number(assigneeId);
    if (!Number.isInteger(parsedAssigneeId) || parsedAssigneeId <= 0) throw new HttpError(400, 'Invalid assignee id');
    filter.assigneeId = parsedAssigneeId;
  }
  if (priority) filter.priority = assertPriority(priority);
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

  if (!body.title || typeof body.title !== 'string') {
    throw new HttpError(400, 'title is required');
  }
  const projectId = Number(body.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) throw new HttpError(400, 'projectId is required');
  await assertProjectAccess(req, projectId);
  if (body.status !== undefined) assertStatus(body.status);
  if (body.priority !== undefined) assertPriority(body.priority);
  const assigneeId = parseAssigneeId(body.assigneeId, Object.hasOwn(body, 'assigneeId')) ?? null;
  await assertAssigneeIsActive(assigneeId);
  if (assigneeId !== null && !(await projectRepo.isProjectMember(projectId, assigneeId))) {
    throw new HttpError(400, 'Assignee must be a member of the selected project');
  }

  let taskCode = typeof body.taskCode === 'string' && body.taskCode.trim()
    ? body.taskCode.trim()
    : undefined;

  if (!taskCode) {
    taskCode = await taskRepo.nextTaskCode();
  } else if (await taskRepo.getTaskByCode(taskCode)) {
    throw new HttpError(409, `Task code ${taskCode} already exists`);
  }

  const task = await taskRepo.createTask(
    { ...body, projectId, assigneeId, taskCode } as Parameters<typeof taskRepo.createTask>[0],
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
  for (const dateField of ['startDate', 'estimatedDate', 'actualDate'] as const) {
    if (Object.hasOwn(body, dateField)) {
      const requestedDate = body[dateField] === '' ? null : body[dateField];
      if (requestedDate !== existing[dateField]) {
        throw new HttpError(400, `${dateField} cannot be changed after task creation`);
      }
      delete body[dateField];
    }
  }
  if (body.projectId !== undefined) {
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId) || projectId <= 0) throw new HttpError(400, 'projectId must be a positive project id');
    body.projectId = projectId;
  }
  const targetProjectId = body.projectId === undefined ? existing.projectId : body.projectId as number;
  await assertProjectAccess(req, targetProjectId);
  if (body.status !== undefined) assertStatus(body.status);
  if (body.priority !== undefined) assertPriority(body.priority);
  const assigneeId = parseAssigneeId(body.assigneeId, Object.hasOwn(body, 'assigneeId'));
  await assertAssigneeIsActive(assigneeId);
  if (assigneeId !== undefined && assigneeId !== null && !(await projectRepo.isProjectMember(targetProjectId, assigneeId))) {
    throw new HttpError(400, 'Assignee must be a member of the selected project');
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
]);
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

export async function remove(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const existing = await taskRepo.getTaskById(id);
  if (!existing) throw new HttpError(404, 'Task not found');
  await assertTaskAccess(req, existing);
  const ok = await taskRepo.deleteTask(id);
  if (!ok) throw new HttpError(404, 'Task not found');
  res.status(204).send();
}

export async function stats(req: Request, res: Response) {
  const data = await taskRepo.getStatsByAssignee(canManageProjects(req) ? undefined : req.user?.id);
  res.json({ data });
}
