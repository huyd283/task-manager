import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, BriefcaseBusiness, Check, Edit3, FolderKanban, Plus, Trash2, Users, X } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { AssignableUser, Project, ProjectStatus } from '../types';

const STATUSES: Array<{ value: ProjectStatus; label: string; style: string }> = [
  { value: 'PLANNING', label: 'Lên kế hoạch', style: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'ACTIVE', label: 'Đang thực hiện', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'ON_HOLD', label: 'Tạm dừng', style: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'COMPLETED', label: 'Hoàn thành', style: 'bg-slate-100 text-slate-600 border-slate-200' },
];

const emptyForm = { code: '', name: '', description: '', status: 'ACTIVE' as ProjectStatus, memberIds: [] as string[] };
const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10';

function statusMeta(status: ProjectStatus) {
  return STATUSES.find((item) => item.value === status) ?? STATUSES[0];
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join('');
}

export default function ProjectManagement() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.jobTitle === 'Project Lead';
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [projectResponse, userResponse] = await Promise.all([
        api.get<{ data: Project[] }>('/projects'),
        canManage ? api.get<{ data: AssignableUser[] }>('/users/options') : Promise.resolve({ data: { data: [] } }),
      ]);
      setProjects(projectResponse.data.data ?? []);
      setUsers(userResponse.data.data ?? []);
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không tải được dữ liệu dự án.');
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    setForm({
      code: project.code,
      name: project.name,
      description: project.description ?? '',
      status: project.status,
      memberIds: project.members.map((member) => String(member.id)),
    });
    setFormError('');
    setModalOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = { ...form, code: form.code.trim(), name: form.name.trim(), memberIds: form.memberIds.map(Number) };
      if (editing) await api.put(`/projects/${editing.id}`, payload);
      else await api.post('/projects', payload);
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể lưu dự án.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (project: Project) => {
    if (!window.confirm(`Xóa dự án ${project.code}?`)) return;
    try {
      await api.delete(`/projects/${project.id}`);
      await load();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể xóa dự án.');
    }
  };

  const runningCount = projects.filter((project) => project.status === 'ACTIVE').length;
  const memberCount = new Set(projects.flatMap((project) => project.members.map((member) => member.id))).size;

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-blue-600 via-cyan-500 to-emerald-500" />
        <div className="flex flex-col justify-between gap-4 pl-2 sm:flex-row sm:items-center">
          <div>
            <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-blue-600">Workspace</p>
            <h1 className="text-2xl font-extrabold text-slate-900">Quản lý Dự án</h1>
            <p className="mt-1 text-sm text-slate-500">Theo dõi danh mục dự án, nhân sự và khối lượng công việc.</p>
          </div>
          {canManage && <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/20"><Plus size={16} /> Thêm dự án</button>}
        </div>
      </header>

      {error && <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700"><AlertCircle size={16} />{error}</div>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Tổng dự án', value: projects.length, icon: FolderKanban, tone: 'text-blue-600 bg-blue-50' },
          { label: 'Đang thực hiện', value: runningCount, icon: BriefcaseBusiness, tone: 'text-emerald-600 bg-emerald-50' },
          { label: 'Nhân sự tham gia', value: memberCount, icon: Users, tone: 'text-amber-600 bg-amber-50' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}><Icon size={20} /></div>
            <div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="text-2xl font-extrabold text-slate-900">{value}</p></div>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-800">Danh sách dự án</h2>
          <span className="text-xs font-semibold text-slate-400">{projects.length} dự án</span>
        </div>
        {loading ? <div className="rounded-2xl border border-slate-200/80 bg-white py-16 text-center text-sm text-slate-400">Đang tải dự án...</div> : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <FolderKanban size={28} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">Chưa có dự án được phân quyền</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_150px_180px_90px_76px] gap-4 border-b border-slate-200 bg-slate-50/80 px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 max-md:hidden">
              <span>Dự án</span><span>Trạng thái</span><span>Nhân sự</span><span>Công việc</span><span />
            </div>
            <div className="divide-y divide-slate-100">
              {projects.map((project) => (
                <article key={project.id} className="grid grid-cols-1 items-center gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_150px_180px_90px_76px] md:gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="font-mono text-[11px] font-bold text-blue-700">{project.code}</span><span className="truncate text-sm font-extrabold text-slate-800">{project.name}</span></div>
                    {project.description && <p className="mt-1 truncate text-xs text-slate-500">{project.description}</p>}
                  </div>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusMeta(project.status).style}`}>{statusMeta(project.status).label}</span>
                  <div className="flex items-center">
                    <div className="flex -space-x-2">
                      {project.members.slice(0, 5).map((member) => <div key={member.id} title={member.name} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-cyan-500 to-blue-700 text-[9px] font-black text-white">{initials(member.name)}</div>)}
                    </div>
                    {project.members.length > 5 && <span className="ml-2 text-[11px] font-bold text-slate-500">+{project.members.length - 5}</span>}
                    {project.members.length === 0 && <span className="text-xs text-slate-400">Chưa có nhân sự</span>}
                  </div>
                  <span className="text-xs font-bold text-slate-700">{project.task_count} task</span>
                  <div className="flex gap-1">
                    {canManage && <>
                      <button onClick={() => openEdit(project)} title="Sửa dự án" className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700"><Edit3 size={15} /></button>
                      <button onClick={() => void remove(project)} title="Xóa dự án" className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                    </>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <form onSubmit={submit} className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl">
            <div className="relative flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500" />
              <div><h2 className="text-base font-extrabold text-slate-900">{editing ? 'Cập nhật dự án' : 'Tạo dự án'}</h2><p className="mt-1 text-xs text-slate-500">Thông tin cơ bản và thành viên dự án</p></div>
              <button type="button" onClick={() => setModalOpen(false)} title="Đóng" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="space-y-4 overflow-y-auto p-5">
              {formError && <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle size={15} />{formError}</div>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">Mã dự án<input required maxLength={40} className={`${inputClass} mt-1.5 font-mono`} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="PRJ-001" /></label>
                <label className="text-xs font-bold text-slate-700">Tên dự án<input required maxLength={160} className={`${inputClass} mt-1.5`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Tên dự án" /></label>
              </div>
              <label className="block text-xs font-bold text-slate-700">Trạng thái<select className={`${inputClass} mt-1.5`} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ProjectStatus })}>{STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
              <label className="block text-xs font-bold text-slate-700">Mô tả<textarea rows={3} className={`${inputClass} mt-1.5 resize-none`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Mục tiêu và phạm vi dự án" /></label>
              <label className="block text-xs font-bold text-slate-700">Nhân sự tham gia<select multiple className={`${inputClass} mt-1.5 min-h-36`} value={form.memberIds} onChange={(event) => setForm({ ...form, memberIds: Array.from(event.target.selectedOptions, (option) => option.value) })}>{users.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.employeeCode}</option>)}</select><span className="mt-1 block text-[11px] font-medium text-slate-400">Đã chọn {form.memberIds.length} nhân sự</span></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{saving ? 'Đang lưu...' : <><Check size={15} /> Lưu dự án</>}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}