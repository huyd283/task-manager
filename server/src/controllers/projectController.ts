import type { Request, Response } from 'express';
import { HttpError } from '../middleware/errorHandler';
import * as projectRepo from '../repositories/projectRepository';
import * as userRepo from '../repositories/userRepository';

const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'] as const;

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}

function canManage(req: Request) {
  return req.user?.role === 'admin' || req.user?.jobTitle === 'Project Lead';
}

function requireManager(req: Request) {
  if (!canManage(req)) throw new HttpError(403, 'Project administrator access required');
}

function parseInput(body: Record<string, unknown>) {
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() || null : null;
  const status = body.status ?? 'ACTIVE';
  const memberIds = body.memberIds ?? [];
  if (!code || code.length > 40) throw new HttpError(400, 'Project code is required (maximum 40 characters)');
  if (!name || name.length > 160) throw new HttpError(400, 'Project name is required (maximum 160 characters)');
  if (typeof status !== 'string' || !PROJECT_STATUSES.includes(status as (typeof PROJECT_STATUSES)[number])) {
    throw new HttpError(400, 'Invalid project status');
  }
  if (!Array.isArray(memberIds) || memberIds.some((id) => !Number.isInteger(id) || Number(id) <= 0)) {
    throw new HttpError(400, 'memberIds must be an array of positive user ids');
  }
  return { code, name, description, status: status as (typeof PROJECT_STATUSES)[number], memberIds: [...new Set(memberIds as number[])] };
}

async function assertMembersActive(memberIds: number[]) {
  const active = await Promise.all(memberIds.map((id) => userRepo.isAssignableUser(id)));
  if (active.some((isActive) => !isActive)) throw new HttpError(400, 'All project members must be active users');
}

export async function list(req: Request, res: Response) {
  const projects = await projectRepo.listProjects(canManage(req) ? undefined : req.user?.id);
  res.json({ data: projects, count: projects.length });
}

export async function getOne(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (!canManage(req) && !(await projectRepo.isProjectMember(id, req.user!.id))) {
    throw new HttpError(404, 'Project not found');
  }
  const project = await projectRepo.getProject(id);
  if (!project) throw new HttpError(404, 'Project not found');
  res.json({ data: project });
}

export async function create(req: Request, res: Response) {
  requireManager(req);
  const input = parseInput(req.body ?? {});
  await assertMembersActive(input.memberIds);
  const id = await projectRepo.createProject(input);
  res.status(201).json({ data: await projectRepo.getProject(id) });
}

export async function update(req: Request, res: Response) {
  requireManager(req);
  const id = parseId(req.params.id);
  if (!(await projectRepo.projectExists(id))) throw new HttpError(404, 'Project not found');
  const input = parseInput(req.body ?? {});
  await assertMembersActive(input.memberIds);
  await projectRepo.updateProject(id, input);
  res.json({ data: await projectRepo.getProject(id) });
}

export async function remove(req: Request, res: Response) {
  requireManager(req);
  const id = parseId(req.params.id);
  if (!(await projectRepo.projectExists(id))) throw new HttpError(404, 'Project not found');
  try {
    await projectRepo.deleteProject(id);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_ROW_IS_REFERENCED_2') {
      throw new HttpError(409, 'Projects with tasks cannot be deleted');
    }
    throw error;
  }
  res.status(204).send();
}

export async function addMember(req: Request, res: Response) {
  requireManager(req);
  const projectId = parseId(req.params.id);
  const userId = Number((req.body ?? {}).userId);
  const role = typeof (req.body ?? {}).roleInProject === 'string' ? (req.body as { roleInProject: string }).roleInProject : 'member';
  if (!Number.isInteger(userId) || userId <= 0) throw new HttpError(400, 'userId must be a positive user id');
  if (!(await projectRepo.projectExists(projectId))) throw new HttpError(404, 'Project not found');
  if (!(await userRepo.isAssignableUser(userId))) throw new HttpError(400, 'User must be active');
  await projectRepo.addMember(projectId, userId, role);
  res.json({ data: await projectRepo.getProject(projectId) });
}

export async function removeMember(req: Request, res: Response) {
  requireManager(req);
  const projectId = parseId(req.params.id);
  const userId = parseId(req.params.userId);
  if (!(await projectRepo.projectExists(projectId))) throw new HttpError(404, 'Project not found');
  await projectRepo.removeMember(projectId, userId);
  res.status(204).send();
}