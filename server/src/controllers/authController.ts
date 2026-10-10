import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { findUserByEmail, findUserById } from '../repositories/userRepository';
import * as registrationRepo from '../repositories/registrationRepository';
import { sendRegistrationOtp } from '../services/emailService';
import { env } from '../config/env';
import { signToken } from '../utils/jwt';
import { HttpError } from '../middleware/errorHandler';

const JOB_TITLES = ['Developer', 'Tester', 'Designer'] as const;
const DEPARTMENTS = ['Phát triển Phần mềm', 'QA', 'UI/UX', 'Product', 'Operations'] as const;
const OTP_LIFETIME_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function otpDigest(email: string, otp: string): string {
  return createHmac('sha256', env.jwtSecret).update(`${email}:${otp}`).digest('hex');
}

function hasMatchingOtp(email: string, otp: string, expected: string): boolean {
  const actualBuffer = Buffer.from(otpDigest(email, otp), 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function parseRegistration(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle : '';
  const department = typeof body.department === 'string' ? body.department : '';
  if (!name || name.length > 120) throw new HttpError(400, 'Họ tên là bắt buộc (tối đa 120 ký tự)');
  if (email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email không hợp lệ');
  if (password.length < 6 || password.length > 128) throw new HttpError(400, 'Mật khẩu phải có từ 6 đến 128 ký tự');
  if (!JOB_TITLES.includes(jobTitle as (typeof JOB_TITLES)[number])) throw new HttpError(400, 'Chức danh không hợp lệ');
  if (!DEPARTMENTS.includes(department as (typeof DEPARTMENTS)[number])) throw new HttpError(400, 'Phòng ban không hợp lệ');
  return { name, email, password, jobTitle, department };
}

async function issueOtp(email: string, name: string, passwordHash: string, jobTitle: string, department: string) {
  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const now = Date.now();
  await registrationRepo.savePending({
    email,
    name,
    passwordHash,
    jobTitle,
    department,
    otpHash: otpDigest(email, otp),
    expiresAt: new Date(now + OTP_LIFETIME_MS),
    resendAvailableAt: new Date(now + OTP_RESEND_MS),
  });
  try {
    await sendRegistrationOtp(email, name, otp);
  } catch (error) {
    await registrationRepo.deletePending(email);
    throw error;
  }
}

export async function requestRegistrationOtp(req: Request, res: Response) {
  const input = parseRegistration((req.body ?? {}) as Record<string, unknown>);
  if (await findUserByEmail(input.email)) throw new HttpError(409, 'Email này đã được đăng ký');
  const pending = await registrationRepo.findPending(input.email);
  if (pending && new Date(pending.resend_available_at).getTime() > Date.now()) {
    throw new HttpError(429, 'Vui lòng đợi trước khi gửi lại mã OTP');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  await issueOtp(input.email, input.name, passwordHash, input.jobTitle, input.department);
  res.json({ message: 'Mã xác minh đã được gửi đến email của bạn', expiresInSeconds: 300, resendInSeconds: 60 });
}

export async function resendRegistrationOtp(req: Request, res: Response) {
  const email = normalizeEmail((req.body ?? {}).email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email không hợp lệ');
  const pending = await registrationRepo.findPending(email);
  if (!pending) throw new HttpError(404, 'Không tìm thấy yêu cầu đăng ký. Vui lòng điền lại biểu mẫu.');
  if (new Date(pending.resend_available_at).getTime() > Date.now()) throw new HttpError(429, 'Vui lòng đợi trước khi gửi lại mã OTP');
  await issueOtp(email, pending.name, pending.password_hash, pending.job_title, pending.department);
  res.json({ message: 'Mã xác minh mới đã được gửi', expiresInSeconds: 300, resendInSeconds: 60 });
}

export async function verifyRegistrationOtp(req: Request, res: Response) {
  const email = normalizeEmail((req.body ?? {}).email);
  const otp = typeof (req.body ?? {}).otp === 'string' ? (req.body as { otp: string }).otp.trim() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email không hợp lệ');
  if (!/^\d{6}$/.test(otp)) throw new HttpError(400, 'Mã OTP phải gồm 6 chữ số');
  const pending = await registrationRepo.findPending(email);
  if (!pending) throw new HttpError(400, 'Yêu cầu OTP không tồn tại hoặc đã hết hạn');
  if (new Date(pending.expires_at).getTime() <= Date.now()) {
    await registrationRepo.deletePending(email);
    throw new HttpError(400, 'Mã OTP đã hết hạn. Vui lòng gửi mã mới.');
  }
  if (pending.attempts >= MAX_OTP_ATTEMPTS) {
    await registrationRepo.deletePending(email);
    throw new HttpError(429, 'Bạn đã nhập sai quá số lần cho phép. Hãy yêu cầu mã mới.');
  }
  if (!hasMatchingOtp(email, otp, pending.otp_hash)) {
    await registrationRepo.incrementAttempts(email);
    throw new HttpError(400, 'Mã OTP không chính xác');
  }
  if (await findUserByEmail(email)) {
    await registrationRepo.deletePending(email);
    throw new HttpError(409, 'Email này đã được đăng ký');
  }
  const user = await registrationRepo.createVerifiedUser(email, pending.otp_hash);
  if (!user) throw new HttpError(400, 'Yêu cầu OTP không tồn tại hoặc đã được sử dụng');
  res.status(201).json({ message: 'Xác minh thành công. Bạn có thể đăng nhập.', employeeCode: user.employee_code });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    throw new HttpError(400, 'email and password are required');
  }

  const user = await findUserByEmail(email);
  if (!user) {
    throw new HttpError(401, 'Invalid credentials');
  }
  if (!user.is_active) {
    throw new HttpError(403, 'This account is inactive');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new HttpError(401, 'Invalid credentials');
  }

  const token = signToken({ id: user.id, email: user.email });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, jobTitle: user.job_title },
  });
}

export async function me(req: Request, res: Response) {
  const principal = req.user;
  if (!principal) {
    throw new HttpError(401, 'Unauthenticated');
  }

  const user = await findUserById(principal.id);
  if (!user) {
    throw new HttpError(401, 'User not found');
  }

  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, jobTitle: user.job_title },
  });
}
