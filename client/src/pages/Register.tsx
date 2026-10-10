import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, KeyRound, LoaderCircle, Mail, UserRound, UserRoundPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client';

const JOB_TITLES = ['Developer', 'Tester', 'Designer'] as const;
const DEPARTMENTS = ['Phát triển Phần mềm', 'QA', 'UI/UX', 'Product', 'Operations'] as const;
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10';

function errorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' && error !== null && 'response' in error &&
    typeof error.response === 'object' && error.response !== null && 'data' in error.response &&
    typeof error.response.data === 'object' && error.response.data !== null &&
    'message' in error.response.data && typeof error.response.data.message === 'string'
  ) return error.response.data.message;
  return fallback;
}

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [jobTitle, setJobTitle] = useState<(typeof JOB_TITLES)[number]>('Developer');
  const [department, setDepartment] = useState<(typeof DEPARTMENTS)[number]>(DEPARTMENTS[0]);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!otpSent || resendCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCountdown((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpSent, resendCountdown]);

  const validate = () => {
    if (!name.trim()) return 'Vui lòng nhập họ tên.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Địa chỉ email chưa hợp lệ.';
    if (password.length < 6) return 'Mật khẩu cần có ít nhất 6 ký tự.';
    if (password !== passwordConfirmation) return 'Mật khẩu nhập lại chưa khớp.';
    return '';
  };

  const requestOtp = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading('Đang gửi mã xác minh...');
    try {
      const response = await api.post('/auth/register/request-otp', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        jobTitle,
        department,
      });
      setOtpSent(true);
      setOtp('');
      setResendCountdown(Number(response.data?.resendInSeconds ?? 60));
      toast.success('Mã OTP đã được gửi đến email của bạn.', { id: toastId });
    } catch (error) {
      toast.error(errorMessage(error, 'Không thể gửi mã OTP. Vui lòng thử lại.'), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      toast.error('Mã xác minh cần gồm 6 chữ số.');
      return;
    }
    setSubmitting(true);
    const toastId = toast.loading('Đang xác minh mã...');
    try {
      const response = await api.post('/auth/register/verify-otp', {
        email: email.trim().toLowerCase(),
        otp,
      });
      toast.success(`Đăng ký thành công${response.data?.employeeCode ? ` · ${response.data.employeeCode}` : ''}.` , { id: toastId });
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, 'Xác minh OTP thất bại.'), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const resendOtp = async () => {
    if (resendCountdown > 0 || submitting) return;
    setSubmitting(true);
    const toastId = toast.loading('Đang gửi lại mã OTP...');
    try {
      const response = await api.post('/auth/register/resend-otp', { email: email.trim().toLowerCase() });
      setOtp('');
      setResendCountdown(Number(response.data?.resendInSeconds ?? 60));
      toast.success('Mã OTP mới đã được gửi.', { id: toastId });
    } catch (error) {
      toast.error(errorMessage(error, 'Không thể gửi lại mã OTP.'), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(59,130,246,0.12),_transparent_48%),radial-gradient(ellipse_at_bottom_right,_rgba(20,184,166,0.11),_transparent_45%)]" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-10 text-white lg:flex">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/10" />
          <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full border border-cyan-300/15" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-cyan-200"><CheckCircle2 size={21} /></div>
              <span className="text-sm font-black tracking-[0.18em]">TOMOTEK</span>
            </div>
            <p className="mt-16 text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Team workspace</p>
            <h1 className="mt-4 max-w-sm text-4xl font-extrabold leading-tight">Tạo không gian làm việc của bạn.</h1>
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-300">Xác minh email để tham gia quản lý dự án và phối hợp công việc cùng đội ngũ.</p>
          </div>
          <p className="relative text-xs text-slate-400">Tài khoản mới sẽ được cấp mã nhân viên tự động.</p>
        </aside>

        <section className="p-6 sm:p-9 lg:p-10">
          {!otpSent ? (
            <>
              <div className="mb-7">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700 lg:hidden"><UserRoundPlus size={21} /></div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-700">TOMOTEK · Đăng ký</p>
                <h2 className="mt-2 text-2xl font-extrabold text-slate-900">Tạo tài khoản</h2>
                <p className="mt-1 text-sm text-slate-500">Điền thông tin để nhận mã xác minh qua email.</p>
              </div>

              <form onSubmit={requestOtp} className="space-y-4">
                <label className="block text-xs font-bold text-slate-700">Họ và tên
                  <span className="relative mt-1.5 block"><UserRound size={16} className="absolute left-3 top-3.5 text-slate-400" /><input required maxLength={120} autoComplete="name" className={`${inputClass} pl-10`} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nguyễn Văn An" /></span>
                </label>
                <label className="block text-xs font-bold text-slate-700">Email công việc
                  <span className="relative mt-1.5 block"><Mail size={16} className="absolute left-3 top-3.5 text-slate-400" /><input required type="email" autoComplete="email" className={`${inputClass} pl-10`} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ten@congty.com" /></span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-slate-700">Chức danh
                    <select className={`${inputClass} mt-1.5`} value={jobTitle} onChange={(event) => setJobTitle(event.target.value as (typeof JOB_TITLES)[number])}>{JOB_TITLES.map((title) => <option key={title} value={title}>{title}</option>)}</select>
                  </label>
                  <label className="block text-xs font-bold text-slate-700">Phòng ban
                    <select className={`${inputClass} mt-1.5`} value={department} onChange={(event) => setDepartment(event.target.value as (typeof DEPARTMENTS)[number])}>{DEPARTMENTS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                  </label>
                </div>
                <label className="block text-xs font-bold text-slate-700">Mật khẩu
                  <input required minLength={6} maxLength={128} type="password" autoComplete="new-password" className={`${inputClass} mt-1.5`} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tối thiểu 6 ký tự" />
                </label>
                <label className="block text-xs font-bold text-slate-700">Nhập lại mật khẩu
                  <input required minLength={6} maxLength={128} type="password" autoComplete="new-password" className={`${inputClass} mt-1.5`} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} placeholder="Nhập lại mật khẩu" />
                </label>
                <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:from-blue-800 hover:to-indigo-800 disabled:cursor-wait disabled:opacity-60">
                  {submitting ? <LoaderCircle size={17} className="animate-spin" /> : <Mail size={17} />}
                  Gửi mã OTP
                </button>
              </form>
            </>
          ) : (
            <div className="flex min-h-[570px] flex-col justify-center">
              <button type="button" onClick={() => setOtpSent(false)} className="mb-8 inline-flex w-fit items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-700"><ArrowLeft size={15} /> Quay lại biểu mẫu</button>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><KeyRound size={22} /></div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-700">Email verification</p>
              <h2 className="mt-2 text-2xl font-extrabold text-slate-900">Nhập mã xác minh</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Mã 6 chữ số đã gửi đến <strong className="break-all text-slate-700">{email}</strong>. Mã có hiệu lực trong 5 phút.</p>

              <form onSubmit={verifyOtp} className="mt-8 space-y-5">
                <label className="block text-xs font-bold text-slate-700">Mã OTP
                  <input required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" className={`${inputClass} mt-1.5 h-16 text-center font-mono text-2xl font-extrabold tracking-[0.5em]`} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" />
                </label>
                <button type="submit" disabled={submitting || otp.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:from-blue-800 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {submitting ? <LoaderCircle size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                  Xác nhận và tạo tài khoản
                </button>
              </form>

              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5 text-xs">
                <span className="text-slate-500">Chưa nhận được email?</span>
                <button type="button" disabled={resendCountdown > 0 || submitting} onClick={() => void resendOtp()} className="font-bold text-blue-700 hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-slate-400">
                  {resendCountdown > 0 ? `Gửi lại sau ${resendCountdown}s` : 'Gửi lại mã'}
                </button>
              </div>
            </div>
          )}

          <p className="mt-7 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
            Đã có tài khoản? <Link to="/login" className="font-bold text-blue-700 hover:text-indigo-700">Đăng nhập</Link>
          </p>
        </section>
      </div>
    </main>
  );
}