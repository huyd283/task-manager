import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import toast from 'react-hot-toast';
import { TASK_STATUSES, STATUS_META, type AssignableUser, type Project, type Task, type TaskStatus } from '../types';
import {
  X,
  Plus,
  Edit3,
  Calendar,
  User,
  Folder,
  Tag,
  AlignLeft,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface TaskModalProps {
  task: Task | null; // null => create mode
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  taskCode: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId: string;
  startDate: string;
  estimatedDate: string;
  dueDate: string;
  actualDate: string;
}

function toForm(task: Task | null): FormState {
  return {
    taskCode: task?.taskCode ?? '',
    projectId: task?.projectId ? String(task.projectId) : '',
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? 'TODO',
    assigneeId: task?.assigneeId ? String(task.assigneeId) : '',
    startDate: task?.startDate ?? '',
    estimatedDate: task?.estimatedDate ?? '',
    dueDate: task?.dueDate ?? '',
    actualDate: task?.actualDate ?? '',
  };
}

/** Converts empty strings to null so blank optional fields clear the column. */
function toPayload(form: FormState) {
  const clean = (value: string) => (value.trim() === '' ? null : value.trim());
  return {
    taskCode: clean(form.taskCode),
    projectId: Number(form.projectId),
    title: form.title.trim(),
    description: clean(form.description),
    status: form.status,
    assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
    startDate: clean(form.startDate),
    estimatedDate: clean(form.estimatedDate),
    dueDate: clean(form.dueDate),
    actualDate: clean(form.actualDate),
  };
}

export default function TaskModal({ task, onClose, onSaved }: TaskModalProps) {
  const [form, setForm] = useState<FormState>(() => toForm(task));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(true);
  const [assigneeLoadError, setAssigneeLoadError] = useState('');
  const isEdit = Boolean(task);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ data: AssignableUser[] }>('/users/options'),
      api.get<{ data: Project[] }>('/projects'),
    ])
      .then(([usersResponse, projectsResponse]) => {
        if (!cancelled) {
          setAssignees(Array.isArray(usersResponse.data?.data) ? usersResponse.data.data : []);
          setProjects(Array.isArray(projectsResponse.data?.data) ? projectsResponse.data.data : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssigneeLoadError('Không tải được danh sách nhân sự để phân công.');
          toast.error('Không tải được danh sách dự án hoặc nhân sự để phân công.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAssignees(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (field: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }) as FormState);

  const selectedProject = projects.find((project) => String(project.id) === form.projectId);
  const projectAssignees = selectedProject
    ? assignees.filter((assignee) => selectedProject.members.some((member) => member.id === assignee.id))
    : [];

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Vui lòng nhập tiêu đề công việc');
      toast.error('Vui lòng nhập tiêu đề công việc.');
      return;
    }
    if (!form.projectId) {
      setError('Vui lòng chọn dự án');
      toast.error('Vui lòng chọn dự án.');
      return;
    }
    setError('');
    setSaving(true);
    const toastId = toast.loading(isEdit ? 'Đang cập nhật công việc...' : 'Đang tạo công việc...');
    try {
      const payload = toPayload(form);
      if (isEdit && task) {
        await api.put(`/tasks/${task.id}`, payload);
      } else {
        await api.post('/tasks', payload);
      }
      toast.success(isEdit ? 'Đã cập nhật công việc.' : 'Đã tạo công việc.', { id: toastId });
      onSaved();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Lưu công việc thất bại';
      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all hover:bg-white focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10';
  
  const labelClass = 'flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200/80 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header Modal */}
        <div className="relative flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-white">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600" />
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              {isEdit ? <Edit3 size={18} /> : <Plus size={18} />}
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                {isEdit ? `Sửa công việc #${task?.taskCode}` : 'Tạo công việc mới'}
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                {isEdit ? 'Cập nhật thông tin chi tiết cho công việc' : 'Điền đầy đủ thông tin để khởi tạo task'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={onSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 scrollbar-thin">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200/80 px-4 py-3 text-xs font-semibold text-rose-700">
              <AlertCircle size={16} className="text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Tiêu đề */}
          <div>
            <label className={labelClass}>
              <CheckCircle2 size={14} className="text-blue-600" />
              <span>Tiêu đề công việc <span className="text-rose-500">*</span></span>
            </label>
            <input
              className={inputClass}
              placeholder="Nhập tên công việc..."
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
            />
          </div>

          {/* Mã công việc & Dự án */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                <Tag size={14} className="text-indigo-500" />
                <span>Mã công việc</span>
              </label>
              <input
                className={inputClass}
                placeholder="Tự sinh nếu để trống"
                value={form.taskCode}
                onChange={(e) => update('taskCode', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>
                <Folder size={14} className="text-indigo-500" />
                <span>Dự án <span className="text-rose-500">*</span></span>
              </label>
              <select
                required
                className={`${inputClass} cursor-pointer`}
                value={form.projectId}
                onChange={(e) => {
                  update('projectId', e.target.value);
                  update('assigneeId', '');
                }}
                disabled={loadingAssignees}
              >
                <option value="">Chọn dự án...</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
              </select>
              {projects.length === 0 && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">Bạn chưa được phân vào dự án nào.</p>}
            </div>
          </div>

          {/* Mô tả */}
          <div>
            <label className={labelClass}>
              <AlignLeft size={14} className="text-slate-500" />
              <span>Mô tả chi tiết</span>
            </label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              placeholder="Nhập mô tả chi tiết công việc..."
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </div>

          {/* Trạng thái & Người phụ trách */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                <Tag size={14} className="text-amber-500" />
                <span>Trạng thái</span>
              </label>
              <select
                className={`${inputClass} cursor-pointer`}
                value={form.status}
                onChange={(e) => update('status', e.target.value as TaskStatus)}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                <User size={14} className="text-emerald-500" />
                <span>Người phụ trách</span>
              </label>
                <select
                className={inputClass}
                  value={form.assigneeId}
                  onChange={(e) => update('assigneeId', e.target.value)}
                  disabled={loadingAssignees || !selectedProject}
                >
                  <option value="">Chưa phân công</option>
                  {projectAssignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name} · {assignee.employeeCode}
                    </option>
                  ))}
                </select>
                {assigneeLoadError && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">{assigneeLoadError}</p>}
                {!loadingAssignees && !assigneeLoadError && selectedProject && projectAssignees.length === 0 && (
                  <p className="mt-1.5 text-[11px] font-medium text-slate-400">Dự án chưa có nhân sự để phân công.</p>
                )}
            </div>
          </div>

          {/* Khối các mốc Ngày tháng */}
          <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/60 space-y-3">
            <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={13} />
              <span>Thời gian & Hạn chót</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Bắt đầu</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.startDate}
                  onChange={(e) => update('startDate', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Dự kiến</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.estimatedDate}
                  onChange={(e) => update('estimatedDate', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-rose-600 mb-1">Hạn chót</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.dueDate}
                  onChange={(e) => update('dueDate', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-emerald-600 mb-1">Hoàn thành</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.actualDate}
                  onChange={(e) => update('actualDate', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Actions Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <span>Lưu thay đổi</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}