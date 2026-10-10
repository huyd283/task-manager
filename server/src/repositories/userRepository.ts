import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { randomBytes } from 'node:crypto';
import { pool } from '../config/db';

export interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password: string;
  role: string;
  employee_code: string;
  job_title: string;
  department: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ManagedUserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  role: string;
  employee_code: string;
  job_title: string;
  department: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface AuthUserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  role: string;
  job_title: string;
  is_active: number;
}

export interface AssignableUserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  employee_code: string;
  job_title: string;
  department: string;
}

export interface ManagedUserInput {
  name: string;
  email: string;
  password: string;
  jobTitle: string;
  department: string;
}

function employeeCode(id: number): string {
  return `TMT-${String(id).padStart(3, '0')}`;
}

function temporaryEmployeeCode(): string {
  return `TMP-${randomBytes(8).toString('hex')}`;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}

export async function findAuthUserById(id: number): Promise<AuthUserRow | null> {
  const [rows] = await pool.query<AuthUserRow[]>(
    'SELECT id, name, email, role, job_title, is_active FROM users WHERE id = ? LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}

export async function listManagedUsers(): Promise<ManagedUserRow[]> {
  const [rows] = await pool.query<ManagedUserRow[]>(
    `SELECT id, name, email, role, employee_code, job_title, department,
            is_active, created_at, updated_at
     FROM users ORDER BY id DESC`,
  );
  return rows;
}

export async function listAssignableUsers(): Promise<AssignableUserRow[]> {
  const [rows] = await pool.query<AssignableUserRow[]>(
    `SELECT id, name, email, employee_code, job_title, department
     FROM users WHERE is_active = 1 ORDER BY name ASC`,
  );
  return rows;
}

export async function isAssignableUser(id: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
    [id],
  );
  return rows.length > 0;
}

export async function getManagedUserById(id: number): Promise<ManagedUserRow | null> {
  const [rows] = await pool.query<ManagedUserRow[]>(
    `SELECT id, name, email, role, employee_code, job_title, department,
            is_active, created_at, updated_at
     FROM users WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function isEmailInUse(email: string, exceptId?: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM users WHERE email = ? ${exceptId === undefined ? '' : 'AND id <> ?'} LIMIT 1`,
    exceptId === undefined ? [email] : [email, exceptId],
  );
  return rows.length > 0;
}

export async function createManagedUser(input: ManagedUserInput): Promise<ManagedUserRow> {
  const temporaryCode = temporaryEmployeeCode();
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO users (name, email, password, role, employee_code, job_title, department)
     VALUES (?, ?, ?, 'member', ?, ?, ?)`,
    [input.name, input.email, input.password, temporaryCode, input.jobTitle, input.department],
  );
  const id = result.insertId;
  await pool.query('UPDATE users SET employee_code = ? WHERE id = ?', [employeeCode(id), id]);
  const user = await getManagedUserById(id);
  if (!user) throw new Error('Created user could not be loaded');
  return user;
}

export async function updateManagedUser(
  id: number,
  input: Omit<ManagedUserInput, 'password'>,
): Promise<ManagedUserRow | null> {
  await pool.query(
    'UPDATE users SET name = ?, email = ?, job_title = ?, department = ? WHERE id = ?',
    [input.name, input.email, input.jobTitle, input.department, id],
  );
  return getManagedUserById(id);
}

export async function setUserActive(id: number, isActive: boolean): Promise<ManagedUserRow | null> {
  await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  return getManagedUserById(id);
}

export async function countActiveAdmins(): Promise<number> {
  const [rows] = await pool.query<Array<RowDataPacket & { count: number }>>(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1",
  );
  return Number(rows[0]?.count ?? 0);
}

export async function deleteManagedUser(id: number): Promise<boolean> {
  await pool.query('UPDATE tasks SET assignee = NULL WHERE assignee_user_id = ?', [id]);
  const [result] = await pool.query<ResultSetHeader>('DELETE FROM users WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role?: string;
}): Promise<number> {
  const temporaryCode = temporaryEmployeeCode();
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO users (name, email, password, role, employee_code)
     VALUES (?, ?, ?, ?, ?)`,
    [input.name, input.email, input.password, input.role ?? 'member', temporaryCode],
  );
  await pool.query('UPDATE users SET employee_code = ? WHERE id = ?', [employeeCode(result.insertId), result.insertId]);
  return result.insertId;
}
