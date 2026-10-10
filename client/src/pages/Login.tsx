import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('an@taskmanager.dev');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Đăng nhập thất bại';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const field = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400';

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold text-center">📋 Task Manager</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Đăng nhập để tiếp tục</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Mật khẩu</label>
            <input
              type="password"
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="font-medium text-slate-900 hover:underline">
            Đăng ký
          </Link>
        </p>
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
          Tài khoản demo: <strong>an@taskmanager.dev</strong> / <strong>password123</strong>
        </p>
      </div>
    </div>
  );
}
