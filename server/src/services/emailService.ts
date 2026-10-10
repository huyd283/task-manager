import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
  host: env.email.host,
  port: env.email.port,
  secure: env.email.secure,
  auth: env.email.user && env.email.password
    ? { user: env.email.user, pass: env.email.password }
    : undefined,
});

export async function sendRegistrationOtp(to: string, name: string, otp: string) {
  if (!env.email.user || !env.email.password || !env.email.from) {
    throw new Error('Email service is not configured. Set EMAIL_USER, EMAIL_PASS, and EMAIL_FROM.');
  }

  await transporter.sendMail({
    from: env.email.from,
    to,
    subject: `${otp} là mã xác minh TOMOTEK của bạn`,
    text: `Xin chào ${name}, mã xác minh TOMOTEK của bạn là ${otp}. Mã có hiệu lực trong 5 phút.`,
    html: `
      <div style="margin:0;background:#f1f5f9;padding:36px 16px;font-family:Arial,sans-serif;color:#0f172a">
        <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden">
          <div style="height:6px;background:linear-gradient(90deg,#2563eb,#4f46e5,#06b6d4)"></div>
          <div style="padding:34px 32px">
            <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#2563eb">TOMOTEK</div>
            <h1 style="font-size:24px;margin:18px 0 10px">Xác minh địa chỉ email</h1>
            <p style="font-size:14px;line-height:1.7;color:#475569">Xin chào ${escapeHtml(name)}, nhập mã bên dưới để hoàn tất đăng ký tài khoản của bạn.</p>
            <div style="margin:28px 0;padding:18px;background:#eff6ff;border:1px solid #dbeafe;border-radius:14px;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;color:#1d4ed8">${otp}</div>
            <p style="font-size:13px;line-height:1.7;color:#64748b">Mã có hiệu lực trong <strong>5 phút</strong>. Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.</p>
          </div>
        </div>
        <p style="max-width:520px;margin:16px auto 0;text-align:center;color:#94a3b8;font-size:11px">TOMOTEK · Quản lý công việc và dự án</p>
      </div>`,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}