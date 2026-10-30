import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Edit3,
  Filter,
  Loader2,
  Mail,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { ManagedUser } from '../types';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/common/ConfirmModal';

const JOB_TITLES = ['Project Lead', 'Developer', 'Tester', 'Designer'] as const;
const DEPARTMENTS = [
  'Phát triển Phần mềm',
  'QA',
  'UI/UX',
  'Product',
  'Operations',
] as const;

interface UserForm {
  name: string;
  email: string;
  jobTitle: (typeof JOB_TITLES)[number];
  department: (typeof DEPARTMENTS)[number];
  password: string;
}

const emptyForm: UserForm = {
  name: '',
  email: '',
  jobTitle: 'Developer',
  department: 'Phát triển Phần mềm',
  password: '',
};

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all hover:bg-white focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10';
const labelClass = 'mb-1.5 block text-xs font-bold text-slate-700';

function errorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'message' in error.response.data &&
    typeof error.response.data.message === 'string'
  ) {
    return error.response.data.message;
  }
  return fallback;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function avatarClass(name: string): string {
  const palettes = [
    'from-blue-500 to-indigo-600',
    'from-cyan-500 to-blue-600',
    'from-indigo-500 to-violet-600',
    'from-sky-500 to-cyan-600',
    'from-blue-600 to-slate-700',
  ];
  const hash = Array.from(name).reduce((total, character) => total + character.charCodeAt(0), 0);
  return palettes[hash % palettes.length];
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [jobTitleFilter, setJobTitleFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ManagedUser | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<ManagedUser | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setPageError('');
    try {
      const response = await api.get<{ data: ManagedUser[] }>('/users');
      setUsers(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      const message = errorMessage(error, 'Không thể tải danh sách nhân sự.');
      setPageError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const normalizedSearch = search.trim().toLocaleLowerCase('vi');
  const visibleUsers = users.filter((user) => {
    const matchesSearch =
      normalizedSearch.length === 0 ||
      [user.name, user.email, user.employeeCode].some((value) =>
        value.toLocaleLowerCase('vi').includes(normalizedSearch),
      );
    return (
      matchesSearch &&
      (!departmentFilter || user.department === departmentFilter) &&
      (!jobTitleFilter || user.jobTitle === jobTitleFilter)
    );
  });

  const activeCount = users.filter((user) => user.isActive).length;
  const leadCount = users.filter((user) => user.jobTitle === 'Project Lead').length;

  const openCreateModal = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (user: ManagedUser) => {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      jobTitle: user.jobTitle as UserForm['jobTitle'],
      department: user.department as UserForm['department'],
      password: '',
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
    setFormError('');
  };

  const updateForm = <K extends keyof UserForm>(field: K, value: UserForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!name) {
      setFormError('Vui lòng nhập họ và tên.');
      toast.error('Vui lòng nhập họ và tên.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Vui lòng nhập địa chỉ email hợp lệ.');
      toast.error('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }
    if (!editingUser && (form.password.length < 8 || form.password.length > 128)) {
      setFormError('Mật khẩu tạm cần có từ 8 đến 128 ký tự.');
      toast.error('Mật khẩu tạm cần có từ 8 đến 128 ký tự.');
      return;
    }

    setSaving(true);
    setFormError('');
    const toastId = toast.loading(editingUser ? 'Đang cập nhật nhân sự...' : 'Đang tạo tài khoản nhân sự...');
    const payload = {
      name,
      email,
      jobTitle: form.jobTitle,
      department: form.department,
      ...(!editingUser ? { password: form.password } : {}),
    };
    try {
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, payload);
        toast.success('Đã cập nhật thông tin nhân sự.', { id: toastId });
      } else {
        await api.post('/users', payload);
        toast.success('Đã tạo tài khoản nhân sự.', { id: toastId });
      }
      setIsModalOpen(false);
      setEditingUser(null);
      setForm(emptyForm);
      await loadUsers();
    } catch (error) {
      const message = errorMessage(error, 'Không thể lưu thông tin nhân sự.');
      setFormError(message);
      toast.error(message, { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: ManagedUser) => {
    setBusyUserId(user.id);
    setPageError('');
    const toastId = toast.loading(user.isActive ? 'Đang khóa tài khoản...' : 'Đang kích hoạt tài khoản...');
    try {
      await api.patch(`/users/${user.id}/status`, { isActive: !user.isActive });
      toast.success(user.isActive ? `Đã khóa tài khoản ${user.name}.` : `Đã kích hoạt tài khoản ${user.name}.`, { id: toastId });
      setPendingStatusChange(null);
      await loadUsers();
      return true;
    } catch (error) {
      const message = errorMessage(error, 'Không thể cập nhật trạng thái tài khoản.');
      setPageError(message);
      toast.error(message, { id: toastId });
      return false;
    } finally {
      setBusyUserId(null);
    }
  };

  const deleteUser = async (user: ManagedUser) => {
    setBusyUserId(user.id);
    setPageError('');
    const toastId = toast.loading('Đang xóa nhân sự...');
    try {
      await api.delete(`/users/${user.id}`);
      toast.success(`Đã xóa nhân sự ${user.name}.`, { id: toastId });
      setPendingDelete(null);
      await loadUsers();
      return true;
    } catch (error) {
      const message = errorMessage(error, 'Không thể xóa nhân sự.');
      setPageError(message);
      toast.error(message, { id: toastId });
      return false;
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-blue-600 via-indigo-600 to-violet-600" />
        <div className="pl-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Quản Lý Nhân Sự</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-[10px] font-extrabold text-blue-600">
              <ShieldCheck size={12} />
              Admin
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Danh sách nhân sự, chức danh và trạng thái tài khoản</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-md shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
        >
          <UserPlus size={16} />
          Thêm nhân sự mới
        </button>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Thống kê nhân sự">
        <KpiCard title="Tổng nhân sự" value={users.length} icon={<Users size={20} />} tone="blue" caption="Tài khoản toàn hệ thống" />
        <KpiCard title="Đang hoạt động" value={activeCount} icon={<CheckCircle2 size={20} />} tone="emerald" caption="Có thể đăng nhập và làm việc" />
        <KpiCard title="Project Lead" value={leadCount} icon={<Briefcase size={20} />} tone="indigo" caption="Nhân sự giữ vai trò trưởng nhóm" />
      </section>

      {pageError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-500" />
          <span>{pageError}</span>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Danh sách nhân sự</h2>
            <p className="mt-0.5 text-xs text-slate-400">Hiển thị {visibleUsers.length} trên {users.length} nhân sự</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_160px]">
            <label className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${inputClass} pl-9`}
                placeholder="Tìm tên, email, mã NV..."
                aria-label="Tìm theo họ tên, email hoặc mã nhân viên"
              />
            </label>
            <label className="relative">
              <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
                className={`${inputClass} cursor-pointer pl-9`}
                aria-label="Lọc theo phòng ban"
              >
                <option value="">Tất cả phòng ban</option>
                {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            </label>
            <label className="relative">
              <Briefcase size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={jobTitleFilter}
                onChange={(event) => setJobTitleFilter(event.target.value)}
                className={`${inputClass} cursor-pointer pl-9`}
                aria-label="Lọc theo chức danh"
              >
                <option value="">Tất cả chức danh</option>
                {JOB_TITLES.map((jobTitle) => <option key={jobTitle} value={jobTitle}>{jobTitle}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-left">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3">Mã NV</th>
                <th className="px-5 py-3">Nhân sự</th>
                <th className="px-5 py-3">Vai trò / Chức danh</th>
                <th className="px-5 py-3">Phòng ban</th>
                <th className="px-5 py-3">Trạng thái</th>
                <th className="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-14 text-center text-xs font-semibold text-slate-400">
                  <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin text-blue-500" />Đang tải danh sách...</span>
                </td></tr>
              ) : visibleUsers.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-14 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Users size={20} /></div>
                  <p className="mt-3 text-xs font-bold text-slate-600">{users.length ? 'Không tìm thấy nhân sự phù hợp' : 'Chưa có nhân sự nào'}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{users.length ? 'Thử thay đổi từ khóa hoặc bộ lọc.' : 'Thêm nhân sự đầu tiên để bắt đầu quản lý.'}</p>
                </td></tr>
              ) : visibleUsers.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-5 py-4 text-xs font-extrabold text-blue-700">{user.employeeCode}</td>
                  <td className="px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avatarClass(user.name)} text-xs font-black text-white shadow-sm`}>
                        {initials(user.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-slate-800">{user.name}</p>
                        <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-medium text-slate-400"><Mail size={12} className="shrink-0" />{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      {user.jobTitle === 'Project Lead' && <ShieldCheck size={14} className="text-indigo-500" />}
                      {user.jobTitle}
                    </div>
                    <p className="mt-1 text-[10px] font-medium text-slate-400">{user.role === 'admin' ? 'Quản trị hệ thống' : 'Thành viên'}</p>
                  </td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-600">{user.department}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${user.isActive ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${user.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {user.isActive ? 'Đang hoạt động' : 'Tạm khóa'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPendingStatusChange(user)}
                        disabled={busyUserId === user.id || currentUser?.id === user.id}
                        className={`rounded-lg border px-2.5 py-2 text-[10px] font-bold transition-colors disabled:cursor-wait disabled:opacity-50 ${user.isActive ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                        aria-label={user.isActive ? `Tạm khóa ${user.name}` : `Kích hoạt ${user.name}`}
                        title={currentUser?.id === user.id ? 'Bạn không thể tự khóa tài khoản' : user.isActive ? 'Tạm khóa tài khoản' : 'Kích hoạt tài khoản'}
                      >
                        {busyUserId === user.id ? <Loader2 size={14} className="animate-spin" /> : user.isActive ? 'Khóa' : 'Kích hoạt'}
                      </button>
                      <button type="button" onClick={() => openEditModal(user)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600" aria-label={`Sửa ${user.name}`} title="Sửa thông tin">
                        <Edit3 size={15} />
                      </button>
                      <button type="button" onClick={() => setPendingDelete(user)} disabled={busyUserId === user.id || currentUser?.id === user.id} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label={`Xóa ${user.name}`} title={currentUser?.id === user.id ? 'Bạn không thể tự xóa tài khoản' : 'Xóa nhân sự'}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-200" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="user-modal-title" className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl">
            <div className="relative flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600" />
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">{editingUser ? <Edit3 size={17} /> : <UserPlus size={18} />}</div>
                <div>
                  <h2 id="user-modal-title" className="text-base font-extrabold leading-tight text-slate-900">{editingUser ? 'Chỉnh sửa nhân sự' : 'Thêm nhân sự mới'}</h2>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-400">{editingUser ? `Cập nhật hồ sơ ${editingUser.employeeCode}` : 'Tạo hồ sơ và tài khoản đăng nhập mới'}</p>
                </div>
              </div>
              <button type="button" onClick={closeModal} disabled={saving} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Đóng cửa sổ">
                <X size={18} />
              </button>
            </div>

            <form id="user-form" onSubmit={(event) => void submitForm(event)} className="flex-1 space-y-4 overflow-y-auto p-6">
              {formError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700"><AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-500" /><span>{formError}</span></div>}
              <div>
                <label htmlFor="user-name" className={labelClass}>Họ và tên <span className="text-rose-500">*</span></label>
                <input id="user-name" autoFocus maxLength={120} className={inputClass} placeholder="Nguyễn Văn An" value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
              </div>
              <div>
                <label htmlFor="user-email" className={labelClass}>Email công ty <span className="text-rose-500">*</span></label>
                <input id="user-email" type="email" maxLength={190} className={inputClass} placeholder="ten@congty.vn" value={form.email} onChange={(event) => updateForm('email', event.target.value)} />
              </div>
              {!editingUser && <div>
                <label htmlFor="user-password" className={labelClass}>Mật khẩu tạm <span className="text-rose-500">*</span></label>
                <input id="user-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} className={inputClass} placeholder="Tối thiểu 8 ký tự" value={form.password} onChange={(event) => updateForm('password', event.target.value)} />
              </div>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="user-job-title" className={labelClass}>Vai trò / Chức danh <span className="text-rose-500">*</span></label>
                  <select id="user-job-title" className={`${inputClass} cursor-pointer`} value={form.jobTitle} onChange={(event) => updateForm('jobTitle', event.target.value as UserForm['jobTitle'])}>
                    {JOB_TITLES.map((jobTitle) => <option key={jobTitle} value={jobTitle}>{jobTitle}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="user-department" className={labelClass}>Phòng ban <span className="text-rose-500">*</span></label>
                  <select id="user-department" className={`${inputClass} cursor-pointer`} value={form.department} onChange={(event) => updateForm('department', event.target.value as UserForm['department'])}>
                    {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
                  </select>
                </div>
              </div>
            </form>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
              <button type="button" onClick={closeModal} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50">Hủy</button>
              <button type="submit" form="user-form" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700 disabled:cursor-wait disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : editingUser ? <CheckCircle2 size={14} /> : <UserPlus size={14} />}
                {saving ? 'Đang lưu...' : editingUser ? 'Lưu thay đổi' : 'Tạo nhân sự'}
              </button>
            </div>
          </section>
        </div>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title="Xóa nhân sự?"
        description={pendingDelete ? `Bạn có chắc muốn xóa ${pendingDelete.name}? Thao tác này không thể hoàn tác.` : ''}
        confirmLabel="Xóa nhân sự"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete ? deleteUser(pendingDelete) : undefined}
      />
      <ConfirmModal
        open={pendingStatusChange !== null}
        title={pendingStatusChange?.isActive ? 'Khóa tài khoản?' : 'Kích hoạt tài khoản?'}
        description={pendingStatusChange ? `${pendingStatusChange.isActive ? 'Người dùng sẽ không thể đăng nhập' : 'Người dùng sẽ có thể đăng nhập'}: ${pendingStatusChange.name}.` : ''}
        confirmLabel={pendingStatusChange?.isActive ? 'Khóa tài khoản' : 'Kích hoạt'}
        destructive={pendingStatusChange?.isActive ?? false}
        onCancel={() => setPendingStatusChange(null)}
        onConfirm={() => pendingStatusChange ? toggleActive(pendingStatusChange) : undefined}
      />
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
  tone,
  caption,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  tone: 'blue' | 'emerald' | 'indigo';
  caption: string;
}) {
  const toneClass = {
    blue: { icon: 'bg-blue-50 text-blue-600', value: 'text-blue-700' },
    emerald: { icon: 'bg-emerald-50 text-emerald-600', value: 'text-emerald-600' },
    indigo: { icon: 'bg-indigo-50 text-indigo-600', value: 'text-indigo-700' },
  }[tone];

  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{title}</p>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold transition-transform group-hover:scale-110 ${toneClass.icon}`}>{icon}</div>
      </div>
      <h3 className={`mt-2 text-2xl font-extrabold ${toneClass.value}`}>{value}</h3>
      <p className="mt-1 text-[11px] font-medium text-slate-500">{caption}</p>
    </div>
  );
}