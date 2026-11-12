import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db';
import type { CheckinEmployee } from '../services/checkinService';

export interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  username: string;
  password: string;
  role: string;
  employee_code: string;
  job_title: string;
  department: string;
  is_active: number;
  partner_user_id: number | null;
  partner_status: string | null;
  is_acc_admin: number;
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
  is_acc_admin: number;
}

export interface AssignableUserRow extends RowDataPacket {
  id: number;
  name: string;
  username: string;
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

function temporaryUsername(): string {
  return `TMP-${randomBytes(8).toString('hex')}`;
}

async function releaseUsername(
  connection: PoolConnection,
  username: string,
  exceptUserId?: number,
): Promise<void> {
  const ownerQuery = exceptUserId === undefined
    ? 'SELECT id FROM users WHERE username = ? LIMIT 1 FOR UPDATE'
    : 'SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1 FOR UPDATE';
  const [owners] = await connection.query<Array<RowDataPacket & { id: number }>>(
    ownerQuery,
    exceptUserId === undefined ? [username] : [username, exceptUserId],
  );
  const ownerId = owners[0]?.id;
  if (ownerId === undefined) return;

  let replacement: string;
  do {
    replacement = `conflict_${ownerId}_${randomBytes(8).toString('hex')}`;
    const [existing] = await connection.query<Array<RowDataPacket & { id: number }>>(
      'SELECT id FROM users WHERE username = ? LIMIT 1 FOR UPDATE',
      [replacement],
    );
    if (existing.length === 0) break;
  } while (true);

  await connection.query('UPDATE users SET username = ? WHERE id = ?', [replacement, ownerId]);
}

function usernameFor(email: string, id: number): string {
  const localPart = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 60) || 'user';
  return `${localPart}-${id}`;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT * FROM users WHERE username = ? LIMIT 1',
    [username],
  );
  return rows[0] ?? null;
}

export async function findUserByEmployeeCode(employeeCode: string): Promise<UserRow | null> {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT * FROM users WHERE employee_code = ? LIMIT 1',
    [employeeCode],
  );
  return rows[0] ?? null;
}

export async function updateCheckinIdentity(
  email: string,
  partnerUserId: number,
  partnerStatus: string,
): Promise<void> {
  await pool.query(
    `UPDATE users
     SET partner_user_id = ?, partner_status = ?, is_active = ?
     WHERE email = ?`,
    [partnerUserId, partnerStatus, partnerStatus === 'ACTIVE' ? 1 : 0, email],
  );
}

async function releasePartnerUserId(
  connection: PoolConnection,
  partnerUserId: number,
  excludeUserId?: number,
): Promise<void> {
  if (excludeUserId) {
    await connection.query(
      'UPDATE users SET partner_user_id = NULL WHERE partner_user_id = ? AND id != ?',
      [partnerUserId, excludeUserId],
    );
  } else {
    await connection.query(
      'UPDATE users SET partner_user_id = NULL WHERE partner_user_id = ?',
      [partnerUserId],
    );
  }
}

export async function upsertCheckinEmployee(
  employee: CheckinEmployee,
): Promise<'inserted' | 'updated' | 'skipped-admin'> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const email = employee.email.trim().toLowerCase();
    const [emailMatches] = await connection.query<Array<RowDataPacket & {
      id: number;
      role: string;
      employee_code: string;
    }>>(
      'SELECT id, role, employee_code FROM users WHERE email = ? LIMIT 1 FOR UPDATE',
      [email],
    );
    const existing = emailMatches[0];

    if (existing?.role === 'admin') {
      await connection.commit();
      return 'skipped-admin';
    }

    const isActive = employee.status === 'ACTIVE' ? 1 : 0;
    const checkinUsername = employee.username?.trim();

    if (existing) {
      const username = checkinUsername || existing.employee_code;
      await releaseUsername(connection, username, existing.id);
      await releasePartnerUserId(connection, employee.userId, existing.id);

      await connection.query(
        `UPDATE users
         SET email = ?, name = ?, username = ?,
             job_title = COALESCE(?, job_title), department = COALESCE(?, department),
             partner_user_id = ?, partner_status = ?, is_active = ?, is_acc_admin = ?
         WHERE id = ?`,
        [
          email,
          employee.name,
          username,
          employee.jobTitle,
          employee.department,
          employee.userId,
          employee.status,
          isActive,
          employee.isAccAdmin ? 1 : 0,
          existing.id,
        ],
      );
      await connection.commit();
      return 'updated';
    }

    // Giải phóng partner_user_id nếu từng bị gắn nhầm cho user cũ khác trước khi INSERT
    await releasePartnerUserId(connection, employee.userId);

    const temporaryPassword = randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO users
         (name, email, username, password, role, employee_code, job_title, department,
          is_active, partner_user_id, partner_status, is_acc_admin)
       VALUES (?, ?, ?, ?, 'member', ?, ?, ?, ?, ?, ?, ?)`,
      [
        employee.name,
        email,
        temporaryUsername(),
        passwordHash,
        temporaryEmployeeCode(),
        employee.jobTitle ?? 'Developer',
        employee.department ?? 'Phát triển Phần mềm',
        isActive,
        employee.userId,
        employee.status,
        employee.isAccAdmin ? 1 : 0,
      ],
    );

    const code = employeeCode(result.insertId);
    const username = checkinUsername || code;
    await releaseUsername(connection, username, result.insertId);

    await connection.query(
      'UPDATE users SET employee_code = ?, username = ? WHERE id = ?',
      [
        code,
        username,
        result.insertId,
      ],
    );
    await connection.commit();
    return 'inserted';
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
    'SELECT id, name, email, role, job_title, is_active, is_acc_admin FROM users WHERE id = ? LIMIT 1',
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
    `SELECT id, name, username, email, employee_code, job_title, department
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
    `INSERT INTO users (name, email, username, password, role, employee_code, job_title, department)
     VALUES (?, ?, ?, ?, 'member', ?, ?, ?)`,
    [input.name, input.email, temporaryUsername(), input.password, temporaryCode, input.jobTitle, input.department],
  );
  const id = result.insertId;
  await pool.query('UPDATE users SET employee_code = ?, username = ? WHERE id = ?', [employeeCode(id), usernameFor(input.email, id), id]);
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
    `INSERT INTO users (name, email, username, password, role, employee_code)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.name, input.email, temporaryUsername(), input.password, input.role ?? 'member', temporaryCode],
  );
  await pool.query(
    'UPDATE users SET employee_code = ?, username = ? WHERE id = ?',
    [employeeCode(result.insertId), usernameFor(input.email, result.insertId), result.insertId],
  );
  return result.insertId;
}
