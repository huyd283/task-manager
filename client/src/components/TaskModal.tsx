import { type ClipboardEvent, type FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import toast from 'react-hot-toast';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  STATUS_META,
  PRIORITY_META,
  getTaskPriority,
  type AssignableUser,
  type Project,
  type Task,
  type TaskAttachment,
  type TaskHistoryEntry,
  type TaskPriority,
  type TaskStatus,
} from '../types';
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
  History,
  Paperclip,
  ImagePlus,
  FileText,
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
  priority: TaskPriority;
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
    priority: getTaskPriority(task?.priority),
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
    priority: form.priority,
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
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'attachments'>('details');
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [attachmentError, setAttachmentError] = useState('');
  const [previewAttachment, setPreviewAttachment] = useState<TaskAttachment | null>(null);
  const isEdit = Boolean(task);

  useEffect(() => {
    if (!task || activeTab !== 'history') return;
    setLoadingHistory(true);
    setHistoryError('');
    api.get<{ data: TaskHistoryEntry[] }>(`/tasks/${task.id}/history`)
      .then((response) => setHistory(response.data.data))
      .catch((err: unknown) => {
        const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không tải được lịch sử thao tác.';
        setHistoryError(message);
        toast.error(message);
      })
      .finally(() => setLoadingHistory(false));
  }, [activeTab, task]);

  useEffect(() => {
    if (!task || activeTab !== 'attachments') return;
    setLoadingAttachments(true);
    setAttachmentError('');
    api.get<{ data: TaskAttachment[] }>(`/tasks/${task.id}/attachments`)
      .then((response) => setAttachments(response.data.data))
      .catch((err: unknown) => {
        const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không tải được tệp đính kèm.';
        setAttachmentError(message);
        toast.error(message);
      })
      .finally(() => setLoadingAttachments(false));
  }, [activeTab, task]);

  const uploadAttachment = async (file: File) => {
    if (!task) return;
    if (file.type.startsWith('image/') && file.size >= 5 * 1024 * 1024) {
      throw new Error(`${file.name}: ảnh phải nhỏ hơn 5 MB.`);
    }
    if (!file.type.startsWith('image/') && file.size > 8 * 1024 * 1024) {
      throw new Error(`${file.name}: PDF và tệp văn bản tối đa 8 MB.`);
    }
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Không đọc được tệp.'));
      reader.onerror = () => reject(new Error(`Không đọc được tệp ${file.name}.`));
      reader.readAsDataURL(file);
    });
    const dataBase64 = dataUrl.split(',')[1];
    if (!dataBase64) throw new Error(`Không mã hóa được tệp ${file.name}.`);
    await api.post(`/tasks/${task.id}/attachments`, {
      fileName: file.name,
      mimeType: file.type,
      dataBase64,
    });
  };

  const uploadFiles = async (files: File[]) => {
    if (!task || files.length === 0) return;
    const acceptedTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
    ]);
    const validFiles = files.filter((file) => (
      acceptedTypes.has(file.type) &&
      (file.type.startsWith('image/')
        ? file.size < 5 * 1024 * 1024
        : file.size <= 8 * 1024 * 1024)
    ));
    const rejectedFiles = files.filter((file) => !validFiles.includes(file));
    if (rejectedFiles.length > 0) {
      const message = rejectedFiles.map((file) => {
        if (!acceptedTypes.has(file.type)) return `${file.name}: loại tệp không được hỗ trợ.`;
        return file.type.startsWith('image/')
          ? `${file.name}: ảnh phải nhỏ hơn 5 MB.`
          : `${file.name}: PDF và tệp văn bản tối đa 8 MB.`;
      }).join(' ');
      setAttachmentError(message);
      toast.error(message);
    } else {
      setAttachmentError('');
    }
    if (validFiles.length === 0) return;
    setUploadingAttachments(true);
    try {
      for (const file of validFiles) await uploadAttachment(file);
      const response = await api.get<{ data: TaskAttachment[] }>(`/tasks/${task.id}/attachments`);
      setAttachments(response.data.data);
      toast.success(`Đã tải lên ${validFiles.length} tệp.`);
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? (err instanceof Error ? err.message : 'Tải tệp lên thất bại.');
      setAttachmentError(message);
      toast.error(message);
    } finally {
      setUploadingAttachments(false);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const images = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (images.length > 0) {
      event.preventDefault();
      setActiveTab('attachments');
      void uploadFiles(images);
    }
  };

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
        const { startDate: _startDate, estimatedDate: _estimatedDate, actualDate: _actualDate, ...updatePayload } = payload;
        await api.put(`/tasks/${task.id}`, updatePayload);
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
          {isEdit && (
            <div className="flex gap-2 border-b border-slate-100 pb-3">
              {([
                ['details', 'Chi tiết', <Edit3 size={14} key="details-icon" />],
                ['history', 'Lịch sử thao tác', <History size={14} key="history-icon" />],
                ['attachments', 'Tệp đính kèm', <Paperclip size={14} key="attachments-icon" />],
              ] as const).map(([tab, label, icon]) => (
                <button
                  type="button"
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${
                    activeTab === tab ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {icon}{label}
                </button>
              ))}
            </div>
          )}
          {activeTab === 'details' && (
          <>
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

          {/* Trạng thái, ưu tiên & người phụ trách */}
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
                <Tag size={14} className="text-rose-500" />
                <span>Mức độ ưu tiên</span>
              </label>
              <select
                className={`${inputClass} cursor-pointer`}
                value={form.priority}
                onChange={(e) => update('priority', e.target.value as TaskPriority)}
              >
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{PRIORITY_META[priority].label}</option>
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
                  disabled={isEdit}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Dự kiến</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.estimatedDate}
                  onChange={(e) => update('estimatedDate', e.target.value)}
                  disabled={isEdit}
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
                  disabled={isEdit}
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
          </>
          )}
          {activeTab === 'history' && isEdit && (
            <section className="space-y-3">
              {loadingHistory ? <p className="py-8 text-center text-xs text-slate-400">Đang tải lịch sử...</p> :
                historyError ? <p className="py-8 text-center text-xs text-rose-600">{historyError}</p> :
                  history.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">Chưa có thao tác nào được ghi nhận.</p> :
                    history.map((entry) => (
                      <article key={entry.id} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800">
                            {entry.userName ?? 'Người dùng không xác định'} · {historyActionLabel(entry.actionType)}
                          </p>
                          <p className="mt-1 break-words text-[11px] text-slate-500">
                            {formatHistoryValue(entry.actionType, entry.oldValue)} <span className="px-1 text-slate-300">→</span> {formatHistoryValue(entry.actionType, entry.newValue)}
                          </p>
                          <time className="mt-1 block text-[10px] text-slate-400">
                            {new Date(entry.timestamp).toLocaleString('vi-VN')}
                          </time>
                        </div>
                      </article>
                    ))}
            </section>
          )}
          {activeTab === 'attachments' && isEdit && (
            <section className="space-y-4">
              <div tabIndex={0} onPaste={handlePaste} className="space-y-4 rounded-xl outline-none focus:ring-2 focus:ring-blue-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Ảnh phải nhỏ hơn 5 MB; PDF và tệp văn bản tối đa 8 MB. Có thể dán ảnh vào khu vực này.</p>
                <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 ${uploadingAttachments ? 'pointer-events-none opacity-60' : ''}`}>
                  <ImagePlus size={15} />{uploadingAttachments ? 'Đang tải...' : 'Thêm tệp'}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain"
                    multiple
                    disabled={uploadingAttachments}
                    onChange={(event) => {
                      void uploadFiles(Array.from(event.target.files ?? []));
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
              {attachmentError && <p className="text-xs font-semibold text-rose-600">{attachmentError}</p>}
              {loadingAttachments ? <p className="py-8 text-center text-xs text-slate-400">Đang tải tệp...</p> :
                attachments.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">Chưa có tệp đính kèm.</p> :
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {attachments.map((attachment) => {
                      const dataUrl = `data:${attachment.mimeType};base64,${attachment.dataBase64}`;
                      return (
                        <button
                          type="button"
                          key={attachment.id}
                          onClick={() => setPreviewAttachment(attachment)}
                          className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left hover:border-blue-300"
                        >
                          {attachment.mimeType.startsWith('image/') ? (
                            <img src={dataUrl} alt={attachment.fileName} className="h-28 w-full object-cover" />
                          ) : (
                            <div className="flex h-28 items-center justify-center bg-slate-50 text-slate-500"><FileText size={30} /></div>
                          )}
                          <span className="block truncate px-2 py-2 text-[11px] font-semibold text-slate-700">{attachment.fileName}</span>
                        </button>
                      );
                    })}
                  </div>}
              </div>
            </section>
          )}
        </form>
      </div>
      {previewAttachment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-6" onClick={() => setPreviewAttachment(null)}>
          <button type="button" className="absolute right-5 top-5 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white">Đóng</button>
          {previewAttachment.mimeType.startsWith('image/') ? (
            <img
              src={`data:${previewAttachment.mimeType};base64,${previewAttachment.dataBase64}`}
              alt={previewAttachment.fileName}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <iframe
              title={previewAttachment.fileName}
              src={`data:${previewAttachment.mimeType};base64,${previewAttachment.dataBase64}`}
              className="h-[85vh] w-full max-w-4xl rounded-xl bg-white"
              onClick={(event) => event.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}

function historyActionLabel(action: string): string {
  const labels: Record<string, string> = {
    taskCode: 'đổi mã công việc',
    projectId: 'đổi dự án',
    title: 'đổi tiêu đề',
    description: 'cập nhật mô tả',
    created: 'tạo công việc',
    status: 'đổi trạng thái',
    priority: 'đổi mức ưu tiên',
    assigneeId: 'đổi người phụ trách',
    estimatedDate: 'đổi ngày dự kiến',
    dueDate: 'đổi hạn chót',
    actualDate: 'cập nhật ngày hoàn thành',
    attachment_added: 'đính kèm tệp',
  };
  return labels[action] ?? action;
}

function formatHistoryValue(action: string, value: string | null): string {
  if (value === null) return '—';
  if (action === 'status' && value in STATUS_META) return STATUS_META[value as TaskStatus].label;
  if (action === 'priority' && value in PRIORITY_META) return PRIORITY_META[value as TaskPriority].label;
  return value;
}