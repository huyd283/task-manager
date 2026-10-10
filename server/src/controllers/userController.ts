import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { HttpError } from '../middleware/errorHandler';
import * as userRepo from '../repositories/userRepository';
import type { ManagedUserRow } from '../repositories/userRepository';

const JOB_TITLES = ['Project Lead', 'Developer', 'Tester', 'Designer'] as const;
const DEPARTMENTS = [
  'Phát triển Phần mềm',
  'QA',
  'UI/UX',
  'Product',
  'Operations',
] as const;

function serializeUser(user: ManagedUserRow) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    employeeCode: user.employee_code,
    jobTitle: user.job_title,
    department: user.department,
    isActive: Boolean(user.is_active),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid user id');
  return id;
}

function parseProfile(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle : '';
  const department = typeof body.department === 'string' ? body.department : '';

  if (!name || name.length > 120) throw new HttpError(400, 'Name is required (maximum 120 characters)');
  if (email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'A valid email address is required');
  }
  if (!JOB_TITLES.includes(jobTitle as (typeof JOB_TITLES)[number])) {
    throw new HttpError(400, 'Invalid job title');
  }
  if (!DEPARTMENTS.includes(department as (typeof DEPARTMENTS)[number])) {
    throw new HttpError(400, 'Invalid department');
  }
  return { name, email, jobTitle, department };
}

function isDuplicateEntry(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}

async function ensureEmailAvailable(email: string, exceptId?: number) {
  if (await userRepo.isEmailInUse(email, exceptId)) {
    throw new HttpError(409, 'Email is already registered');
  }
}

export async function list(_req: Request, res: Response) {
  const users = await userRepo.listManagedUsers();
  res.json({ data: users.map(serializeUser), count: users.length });
}

export async function options(_req: Request, res: Response) {
  const users = await userRepo.listAssignableUsers();
  res.json({
    data: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      employeeCode: user.employee_code,
      jobTitle: user.job_title,
      department: user.department,
    })),
    count: users.length,
  });
}

export async function create(req: Request, res: Response) {
  const body = req.body as Record<string, unknown> | undefined;
  const profile = parseProfile(body ?? {});
  const password = typeof body?.password === 'string' ? body.password : '';
  if (password.length < 8 || password.length > 128) {
    throw new HttpError(400, 'Temporary password must be 8 to 128 characters');
  }
  await ensureEmailAvailable(profile.email);

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userRepo.createManagedUser({ ...profile, password: passwordHash });
    res.status(201).json({ data: serializeUser(user) });
  } catch (error) {
    if (isDuplicateEntry(error)) throw new HttpError(409, 'Email is already registered');
    throw error;
  }
}

export async function update(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const existing = await userRepo.getManagedUserById(id);
  if (!existing) throw new HttpError(404, 'User not found');
  const profile = parseProfile((req.body ?? {}) as Record<string, unknown>);
  await ensureEmailAvailable(profile.email, id);

  try {
    const user = await userRepo.updateManagedUser(id, profile);
    res.json({ data: user ? serializeUser(user) : null });
  } catch (error) {
    if (isDuplicateEntry(error)) throw new HttpError(409, 'Email is already registered');
    throw error;
  }
}

export async function updateStatus(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const isActive = (req.body as { isActive?: unknown } | undefined)?.isActive;
  if (typeof isActive !== 'boolean') throw new HttpError(400, 'isActive must be a boolean');
  const existing = await userRepo.getManagedUserById(id);
  if (!existing) throw new HttpError(404, 'User not found');
  if (!isActive && id === req.user?.id) throw new HttpError(400, 'You cannot deactivate your own account');
  if (!isActive && existing.role === 'admin' && existing.is_active && await userRepo.countActiveAdmins() <= 1) {
    throw new HttpError(400, 'The last active administrator cannot be deactivated');
  }

  const user = await userRepo.setUserActive(id, isActive);
  res.json({ data: user ? serializeUser(user) : null });
}

export async function remove(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const existing = await userRepo.getManagedUserById(id);
  if (!existing) throw new HttpError(404, 'User not found');
  if (id === req.user?.id) throw new HttpError(400, 'You cannot delete your own account');
  if (existing.role === 'admin' && await userRepo.countActiveAdmins() <= 1) {
    throw new HttpError(400, 'The last active administrator cannot be deleted');
  }

  await userRepo.deleteManagedUser(id);
  res.status(204).send();
}