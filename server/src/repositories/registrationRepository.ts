import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { randomBytes } from 'node:crypto';
import { pool } from '../config/db';
import type { ManagedUserRow } from './userRepository';

export interface PendingRegistration extends RowDataPacket {
  email: string;
  name: string;
  password_hash: string;
  job_title: string;
  department: string;
  otp_hash: string;
  expires_at: string;
  resend_available_at: string;
  attempts: number;
}

export async function findPending(email: string): Promise<PendingRegistration | null> {
  const [rows] = await pool.query<PendingRegistration[]>(
    'SELECT * FROM pending_registrations WHERE email = ? LIMIT 1', [email],
  );
  return rows[0] ?? null;
}

export async function savePending(input: {
  email: string;
  name: string;
  passwordHash: string;
  jobTitle: string;
  department: string;
  otpHash: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}) {
  await pool.query(
    `INSERT INTO pending_registrations
       (email, name, password_hash, job_title, department, otp_hash, expires_at, resend_available_at, attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash),
       job_title = VALUES(job_title), department = VALUES(department), otp_hash = VALUES(otp_hash),
       expires_at = VALUES(expires_at), resend_available_at = VALUES(resend_available_at), attempts = 0`,
    [input.email, input.name, input.passwordHash, input.jobTitle, input.department, input.otpHash, input.expiresAt, input.resendAvailableAt],
  );
}

export async function incrementAttempts(email: string): Promise<void> {
  await pool.query('UPDATE pending_registrations SET attempts = attempts + 1 WHERE email = ?', [email]);
}

export async function deletePending(email: string): Promise<void> {
  await pool.query('DELETE FROM pending_registrations WHERE email = ?', [email]);
}

export async function createVerifiedUser(email: string, expectedOtpHash: string): Promise<ManagedUserRow | null> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [pendingRows] = await connection.query<PendingRegistration[]>(
      'SELECT * FROM pending_registrations WHERE email = ? FOR UPDATE', [email],
    );
    const pending = pendingRows[0];
    if (!pending || pending.otp_hash !== expectedOtpHash || new Date(pending.expires_at).getTime() <= Date.now()) {
      await connection.rollback();
      return null;
    }
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO users (name, email, password, role, employee_code, job_title, department)
       VALUES (?, ?, ?, 'member', ?, ?, ?)`,
      [pending.name, pending.email, pending.password_hash, `TMP-${randomBytes(8).toString('hex')}`, pending.job_title, pending.department],
    );
    const employeeCode = `TMT-${String(result.insertId).padStart(3, '0')}`;
    await connection.query('UPDATE users SET employee_code = ? WHERE id = ?', [employeeCode, result.insertId]);
    await connection.query('DELETE FROM pending_registrations WHERE email = ?', [email]);
    const [users] = await connection.query<ManagedUserRow[]>(
      `SELECT id, name, email, role, employee_code, job_title, department,
              is_active, created_at, updated_at FROM users WHERE id = ?`,
      [result.insertId],
    );
    await connection.commit();
    return users[0] ?? null;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}