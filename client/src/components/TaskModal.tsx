import { type ClipboardEvent, type FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import ModalPortal from './common/ModalPortal';
import SearchableSelect, { normalizeSearchText } from './common/SearchableSelect';
import toast from 'react-hot-toast';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  STATUS_META,
  PRIORITY_META,
  getTaskPriority,
  STATUS_TRANSITIONS,
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
  Clock,
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
  Download,
  Trash2,
  MessageSquare,
  ListChecks,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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
  assigneeIds: string[];
  startDate: string;
  estimatedDate: string;
  dueDate: string;
  estimatedHours: string;
  loggedHours: string;
  acceptanceNotes: string;
}

interface TaskComment {
  id: number;
  userId: number | null;
  userName: string | null;
  username?: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface Subtask {
  id: number;
  title: string;
  assigneeId: number | null;
  assignee: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  estimatedHours: number | null;
}

function formatAttachmentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderCommentMarkdown(text: string) {
  const tokenPattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|@[A-Za-z0-9._-]+)/g;
  return text.split('\n').map((line, lineIndex) => (
    <span key={lineIndex}>
      {line.split(tokenPattern).map((token, tokenIndex) => {
        if (token.startsWith('**') && token.endsWith('**')) return <strong key={tokenIndex}>{token.slice(2, -2)}</strong>;
        if (token.startsWith('*') && token.endsWith('*')) return <em key={tokenIndex}>{token.slice(1, -1)}</em>;
        if (token.startsWith('`') && token.endsWith('`')) return <code key={tokenIndex} className="rounded bg-slate-200 px-1">{token.slice(1, -1)}</code>;
        if (token.startsWith('@')) return <span key={tokenIndex} className="font-semibold text-blue-700">{token}</span>;
        return token;
      })}
      {lineIndex < text.split('\n').length - 1 && <br />}
    </span>
  ));
}

function toForm(task: Task | null): FormState {
  return {
    taskCode: task?.taskCode ?? '',
    projectId: task?.projectId ? String(task.projectId) : '',
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? 'TODO',
    priority: getTaskPriority(task?.priority),
    assigneeIds: task?.assigneeIds?.length
      ? task.assigneeIds.map(String)
      : task?.assigneeId ? [String(task.assigneeId)] : [],
    startDate: task?.startDate ?? '',
    estimatedDate: task?.estimatedDate ?? '',
    dueDate: task?.dueDate ?? '',
    estimatedHours: task?.estimatedHours == null ? '' : String(task.estimatedHours),
    loggedHours: String(task?.loggedHours ?? 0),
    acceptanceNotes: task?.acceptanceNotes ?? '',
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
    assigneeIds: form.assigneeIds.map(Number),
    assigneeId: form.assigneeIds.length > 0 ? Number(form.assigneeIds[0]) : null,
    startDate: clean(form.startDate),
    estimatedDate: clean(form.estimatedDate),
    dueDate: clean(form.dueDate),
    estimatedHours: form.estimatedHours.trim() === '' ? null : Number(form.estimatedHours),
    loggedHours: Number(form.loggedHours || 0),
    acceptanceNotes: clean(form.acceptanceNotes),
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
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'subtasks' | 'history' | 'attachments'>('details');
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtaskHours, setSubtaskHours] = useState('');
  const [subtaskAssignee, setSubtaskAssignee] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [assigneeDepartment, setAssigneeDepartment] = useState('');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.isAccAdmin === true;
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
    if (!task || activeTab !== 'comments') return;
    api.get<{ data: TaskComment[] }>(`/tasks/${task.id}/comments`)
      .then((response) => setComments(response.data.data))
      .catch(() => toast.error('Không tải được bình luận của task.'));
  }, [activeTab, task]);

  useEffect(() => {
    if (!task || activeTab !== 'subtasks') return;
    api.get<{ data: Subtask[] }>(`/tasks/${task.id}/subtasks`)
      .then((response) => setSubtasks(response.data.data))
      .catch(() => toast.error('Không tải được subtask.'));
  }, [activeTab, task]);

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
      throw new Error(`${file.name}: tệp tối đa 8 MB.`);
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

  const addComment = async () => {
    if (!task || !commentDraft.trim()) return;
    try {
      await api.post(`/tasks/${task.id}/comments`, { body: commentDraft.trim() });
      setCommentDraft('');
      const response = await api.get<{ data: TaskComment[] }>(`/tasks/${task.id}/comments`);
      setComments(response.data.data);
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể thêm bình luận.');
    }
  };

  const insertMention = (username: string) => {
    setCommentDraft((current) => `${current}${current && !/\s$/.test(current) ? ' ' : ''}@${username} `);
  };

  const editComment = async (comment: TaskComment) => {
    const body = window.prompt('Chỉnh sửa bình luận', comment.body);
    if (body === null || !body.trim() || !task) return;
    try {
      await api.put(`/tasks/${task.id}/comments/${comment.id}`, { body: body.trim() });
      setComments((current) => current.map((item) => item.id === comment.id ? { ...item, body: body.trim() } : item));
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể sửa bình luận.');
    }
  };

  const removeComment = async (comment: TaskComment) => {
    if (!task || !window.confirm('Xóa bình luận này?')) return;
    try {
      await api.delete(`/tasks/${task.id}/comments/${comment.id}`);
      setComments((current) => current.filter((item) => item.id !== comment.id));
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể xóa bình luận.');
    }
  };

  const addSubtask = async () => {
    if (!task || !subtaskTitle.trim()) return;
    try {
      await api.post(`/tasks/${task.id}/subtasks`, {
        title: subtaskTitle.trim(),
        assigneeId: subtaskAssignee || null,
        estimatedHours: subtaskHours === '' ? null : Number(subtaskHours),
      });
      setSubtaskTitle('');
      setSubtaskHours('');
      setSubtaskAssignee('');
      const response = await api.get<{ data: Subtask[] }>(`/tasks/${task.id}/subtasks`);
      setSubtasks(response.data.data);
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể tạo subtask.');
    }
  };

  const updateSubtaskStatus = async (subtask: Subtask) => {
    if (!task) return;
    const status = subtask.status === 'DONE' ? 'TODO' : 'DONE';
    try {
      await api.patch(`/tasks/${task.id}/subtasks/${subtask.id}`, { status });
      setSubtasks((current) => current.map((item) => item.id === subtask.id ? { ...item, status } : item));
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể cập nhật subtask.');
    }
  };

  const removeSubtask = async (subtask: Subtask) => {
    if (!task) return;
    try {
      await api.delete(`/tasks/${task.id}/subtasks/${subtask.id}`);
      setSubtasks((current) => current.filter((item) => item.id !== subtask.id));
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể xóa subtask.');
    }
  };

  const removeAttachment = async (attachment: TaskAttachment) => {
    if (!task || !window.confirm(`Xóa tệp "${attachment.fileName}"?`)) return;
    try {
      await api.delete(`/tasks/${task.id}/attachments/${attachment.id}`);
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      toast.success('Đã xóa tệp đính kèm.');
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể xóa tệp đính kèm.');
    }
  };

  const downloadAttachment = async (attachment: TaskAttachment) => {
    if (!task) return;
    try {
      const response = await api.get<Blob>(
        `/tasks/${task.id}/attachments/${attachment.id}/download`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể tải tệp đính kèm.');
    }
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
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    const extensionTypes: Record<string, string[]> = {
      '.jpg': ['image/jpeg'],
      '.jpeg': ['image/jpeg'],
      '.jpe': ['image/jpeg'],
      '.jfif': ['image/jpeg'],
      '.png': ['image/png'],
      '.gif': ['image/gif'],
      '.webp': ['image/webp'],
      '.pdf': ['application/pdf'],
      '.txt': ['text/plain'],
      '.text': ['text/plain'],
      '.log': ['text/plain'],
      '.md': ['text/plain'],
      '.csv': ['text/plain'],
      '.json': ['text/plain'],
      '.xml': ['text/plain'],
      '.yaml': ['text/plain'],
      '.yml': ['text/plain'],
      '.ini': ['text/plain'],
      '.cfg': ['text/plain'],
      '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    };
    const supported = (file: File) => {
      const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      return acceptedTypes.has(file.type) && extensionTypes[extension]?.includes(file.type) === true;
    };
    const validFiles = files.filter((file) => (
      supported(file) &&
      (file.type.startsWith('image/')
        ? file.size < 5 * 1024 * 1024
        : file.size <= 8 * 1024 * 1024)
    ));
    const rejectedFiles = files.filter((file) => !validFiles.includes(file));
    if (rejectedFiles.length > 0) {
      const message = rejectedFiles.map((file) => {
        if (!supported(file)) return `${file.name}: loại tệp không được hỗ trợ hoặc phần mở rộng không khớp MIME type.`;
        return file.type.startsWith('image/')
          ? `${file.name}: ảnh phải nhỏ hơn 5 MB.`
          : `${file.name}: tệp tối đa 8 MB.`;
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
    api.get<{ data: Project[] }>('/projects')
      .then((projectsResponse) => {
        if (!cancelled) {
          setProjects(Array.isArray(projectsResponse.data?.data) ? projectsResponse.data.data : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssigneeLoadError('Không tải được danh sách nhân sự để phân công.');
          toast.error('Không tải được danh sách dự án.');
        }
      })
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!form.projectId) {
      setAssignees([]);
      setLoadingAssignees(false);
      return;
    }
    let cancelled = false;
    setLoadingAssignees(true);
    api.get<{ data: AssignableUser[] }>(`/projects/${form.projectId}/members/options`)
      .then((response) => {
        if (!cancelled) setAssignees(response.data.data ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setAssignees([]);
          setAssigneeLoadError('Không tải được thành viên đang hoạt động của dự án.');
          toast.error('Không tải được danh sách nhân sự của dự án.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAssignees(false);
      });
    return () => { cancelled = true; };
  }, [form.projectId]);

  const update = (field: keyof FormState, value: string) => {
    if (field === 'status' && value === 'IN_PROGRESS' && task?.status !== 'IN_PROGRESS' &&
      (!form.startDate || !form.dueDate)) {
      const message = 'Vui lòng điền cả ngày bắt đầu và hạn chót trước khi chuyển sang Đang thực hiện.';
      setError(message);
      toast.error(message);
      return;
    }
    setError('');
    setForm((prev) => ({ ...prev, [field]: value }) as FormState);
  };
  const appendDescriptionMarkup = (markup: string) => {
    setForm((current) => ({
      ...current,
      description: `${current.description}${current.description && !current.description.endsWith('\n') ? '\n' : ''}${markup}`,
    }));
  };

  const selectedProject = projects.find((project) => String(project.id) === form.projectId);
  const projectAssignees = selectedProject ? assignees : [];
  const departments = [...new Set(projectAssignees.map((assignee) => assignee.department).filter(Boolean))].sort();
  const filteredProjectAssignees = projectAssignees.filter((assignee) => {
    const query = normalizeSearchText(assigneeSearch.trim());
    const matchesText = !query || [assignee.name, assignee.email, assignee.username].some((value) => value && normalizeSearchText(value).includes(query));
    return matchesText && (!assigneeDepartment || assignee.department === assigneeDepartment);
  });
  const toggleAssignee = (assigneeId: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      assigneeIds: checked
        ? [...current.assigneeIds, assigneeId]
        : current.assigneeIds.filter((id) => id !== assigneeId),
    }));
  };

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
    if (!isAdmin && isEdit && task && form.status === 'IN_PROGRESS' && task.status !== 'IN_PROGRESS' &&
      (!form.startDate || !form.dueDate)) {
      const message = 'Vui lòng điền cả ngày bắt đầu và hạn chót trước khi chuyển sang Đang thực hiện.';
      setError(message);
      toast.error(message);
      return;
    }
    setError('');
    setSaving(true);
    const toastId = toast.loading(isEdit ? 'Đang cập nhật công việc...' : 'Đang tạo công việc...');
    try {
      const payload = toPayload(form);
      if (isEdit && task) {
        const updatePayload = { ...payload };
        delete updatePayload.estimatedDate;
        const canUpdateDates = isAdmin || task.status === 'TODO' ||
          (task.status === 'PENDING' && form.status === 'TODO') ||
          (task.status === 'TODO' && form.status === 'IN_PROGRESS');
        if (!canUpdateDates) {
          delete updatePayload.startDate;
          delete updatePayload.dueDate;
        }
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
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl border border-slate-200/80 max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header Modal */}
        <div className="relative flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-white">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600" />
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              {isEdit ? <Edit3 size={18} /> : <Plus size={18} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                {isEdit ? task?.taskCode : 'Tạo công việc mới'}
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                {isEdit ? 'Chi tiết công việc · các thay đổi được lưu khi nhấn Lưu thay đổi' : 'Điền đầy đủ thông tin để khởi tạo task'}
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
        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-5 scrollbar-thin sm:p-6">
          <div className={isEdit ? 'grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]' : 'space-y-5'}>
          <div className="min-w-0 space-y-5">
          {isEdit && (
            <div className="searchable-select-scrollbar flex gap-1 overflow-x-auto border-b border-slate-100 pb-3">
              {([
                ['details', 'Chi tiết', <Edit3 size={14} key="details-icon" />],
                ['comments', 'Bình luận', <MessageSquare size={14} key="comments-icon" />],
                ['subtasks', 'Subtask', <ListChecks size={14} key="subtasks-icon" />],
                ['history', 'Lịch sử thao tác', <History size={14} key="history-icon" />],
                ['attachments', 'Tệp đính kèm', <Paperclip size={14} key="attachments-icon" />],
              ] as const).map(([tab, label, icon]) => (
                <button
                  type="button"
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold transition-colors ${
                    activeTab === tab ? 'border-b-2 border-blue-600 bg-blue-50/70 text-blue-700' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {icon}{label}
                </button>
              ))}
            </div>
          )}
          {activeTab === 'details' ? (
          <>
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200/80 px-4 py-3 text-xs font-semibold text-rose-700">
              <AlertCircle size={16} className="text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Tiêu đề */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <label className={labelClass}>
              <CheckCircle2 size={14} className="text-blue-600" />
              <span>Tiêu đề công việc <span className="text-rose-500">*</span></span>
            </label>
            <input
              className={`${inputClass} border-transparent bg-transparent px-0 text-xl font-extrabold tracking-tight text-slate-900 shadow-none hover:border-transparent focus:border-transparent focus:ring-0 sm:text-2xl`}
              placeholder="Tên công việc..."
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
            />
          </div>

          {/* Mã công việc & Dự án */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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
              <SearchableSelect
                ariaLabel="Chọn dự án cho công việc"
                className={`${inputClass} cursor-pointer`}
                placeholder="Chọn dự án..."
                value={form.projectId}
                onChange={(projectId) => setForm((current) => ({ ...current, projectId, assigneeIds: [] }))}
                disabled={loadingAssignees}
                options={projects.map((project) => ({
                  value: String(project.id),
                  label: `${project.code} · ${project.name}`,
                  keywords: project.code,
                }))}
              />
              {projects.length === 0 && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">Bạn chưa được phân vào dự án nào.</p>}
            </div>
          </div>

          {/* Mô tả */}
          <div>
            <label className={labelClass}>
              <AlignLeft size={14} className="text-slate-500" />
              <span>Mô tả chi tiết</span>
              <span className="ml-auto text-[10px] font-medium text-slate-400">Markdown cơ bản</span>
            </label>
            <div className="mb-2 flex flex-wrap gap-1">
              {[
                ['**in đậm**', '**văn bản**'],
                ['`code`', '`code`'],
                ['- [ ] checklist', '- [ ] '],
                ['```code block```', '```\n\n```'],
              ].map(([label, markup]) => (
                <button key={label} type="button" onClick={() => appendDescriptionMarkup(markup)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 hover:border-blue-200 hover:text-blue-700">
                  {label}
                </button>
              ))}
            </div>
            <textarea
              className={`${inputClass} resize-y bg-white leading-6`}
              rows={7}
              placeholder="Nhập mô tả chi tiết công việc..."
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </div>

          {/* Trạng thái, ưu tiên & người phụ trách */}
          {!isEdit && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                {(isEdit && task ? [task.status, ...STATUS_TRANSITIONS[task.status]] : ['TODO' as TaskStatus]).map((s) => (
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
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2">
                {!selectedProject ? (
                  <p className="p-2 text-[11px] font-medium text-slate-400">Chọn dự án trước khi phân công.</p>
                ) : (
                <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className={inputClass} value={assigneeSearch} onChange={(event) => setAssigneeSearch(event.target.value)} placeholder="Tìm tên, email, username" />
                  <SearchableSelect
                    ariaLabel="Lọc người phụ trách theo phòng ban"
                    className={inputClass}
                    value={assigneeDepartment}
                    onChange={setAssigneeDepartment}
                    placeholder="Mọi phòng ban"
                    options={[
                      { value: '', label: 'Mọi phòng ban' },
                      ...departments.map((department) => ({ value: department, label: department })),
                    ]}
                  />
                </div>
                <div className="max-h-36 space-y-1 overflow-y-auto">
                {filteredProjectAssignees.map((assignee) => {
                  const checked = form.assigneeIds.includes(String(assignee.id));
                  return (
                    <label key={assignee.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${checked ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-white'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleAssignee(String(assignee.id), event.target.checked)}
                        disabled={loadingAssignees}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="min-w-0 truncate">{assignee.name} · {assignee.employeeCode}</span>
                    </label>
                  );
                })}
                {!loadingAssignees && filteredProjectAssignees.length === 0 && (
                  <p className="p-2 text-[11px] font-medium text-slate-400">Không có thành viên đang hoạt động phù hợp.</p>
                )}
                </div>
                </>
                )}
              <p className="mt-1.5 text-[11px] font-medium text-slate-400">Đã chọn {form.assigneeIds.length} nhân sự</p>
              {assigneeLoadError && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">{assigneeLoadError}</p>}
            </div>
            </div>
          </div>}

          {/* Khối các mốc Ngày tháng */}
          {!isEdit && <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/60 space-y-3">
            <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={13} />
              <span>Thời gian & Hạn chót</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-blue-700 mb-1">Dự tính (giờ)</label>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  className={inputClass}
                  placeholder="8"
                  value={form.estimatedHours}
                  onChange={(e) => update('estimatedHours', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-indigo-700 mb-1">Thời gian thực tế (giờ)</label>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  className={inputClass}
                  value={form.loggedHours}
                  onChange={(e) => update('loggedHours', e.target.value)}
                />
              </div>
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
                <p className="rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-xs font-medium text-slate-500">
                  Tự động ghi nhận khi chuyển sang Done
                </p>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Thông tin nghiệm thu</label>
              <textarea
                className={`${inputClass} resize-none`}
                rows={2}
                value={form.acceptanceNotes}
                onChange={(e) => update('acceptanceNotes', e.target.value)}
                placeholder="Kết quả nghiệm thu / liên kết biên bản (nếu có)"
              />
            </div>
            {/* Task duration and calendar dates are separate fields. */}
          </div>}

          {/* Actions Footer */}
          {!isEdit && <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
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
          </div>}
          </>
          ) : null}
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
          {activeTab === 'comments' && isEdit && (
            <section className="space-y-4">
              <div className="space-y-2">
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={3}
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Viết bình luận Markdown nhẹ; dùng @username để nhắc thành viên."
                />
                {projectAssignees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="py-1 text-[10px] text-slate-400">Nhắc:</span>
                    {projectAssignees.map((member) => (
                      <button key={member.id} type="button" onClick={() => insertMention(member.username ?? member.name.replace(/\s+/g, '').toLowerCase())} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
                        @{member.username ?? member.name.replace(/\s+/g, '').toLowerCase()}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => void addComment()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
                  Gửi bình luận
                </button>
              </div>
              <div className="space-y-3">
                {comments.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">Chưa có bình luận.</p> :
                  comments.map((comment) => (
                    <article key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{comment.userName ?? 'Tài khoản đã xóa'}</p>
                          <time className="text-[10px] text-slate-400">{new Date(comment.createdAt).toLocaleString('vi-VN')}</time>
                        </div>
                        {comment.userId === user?.id && (
                          <div className="flex gap-2 text-[10px] font-semibold">
                            <button type="button" onClick={() => void editComment(comment)} className="text-blue-600">Sửa</button>
                            <button type="button" onClick={() => void removeComment(comment)} className="text-rose-600">Xóa</button>
                          </div>
                        )}
                      </div>
                      <p className="mt-2 break-words text-xs text-slate-700">{renderCommentMarkdown(comment.body)}</p>
                    </article>
                  ))}
              </div>
            </section>
          )}
          {activeTab === 'subtasks' && isEdit && (
            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800">Checklist công việc con</h3>
                    <p className="mt-0.5 text-[11px] text-slate-500">Chia nhỏ task và theo dõi tiến độ thực hiện.</p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 shadow-sm">{subtasks.filter((item) => item.status === 'DONE').length}/{subtasks.length}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_minmax(130px,0.7fr)_auto]">
                <input className={inputClass} value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder="Thêm công việc con..." />
                <input className={inputClass} type="number" min="0" step="0.25" value={subtaskHours} onChange={(event) => setSubtaskHours(event.target.value)} placeholder="Giờ dự tính" />
                <SearchableSelect
                  ariaLabel="Chọn người phụ trách subtask"
                  className={inputClass}
                  value={subtaskAssignee}
                  onChange={setSubtaskAssignee}
                  placeholder="Chưa giao"
                  options={[
                    { value: '', label: 'Chưa giao' },
                    ...projectAssignees.map((assignee) => ({
                      value: String(assignee.id),
                      label: assignee.name,
                      keywords: `${assignee.email} ${assignee.username ?? ''} ${assignee.employeeCode}`,
                    })),
                  ]}
                />
                <button type="button" onClick={() => void addSubtask()} className="inline-flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"><Plus size={14} />Thêm</button>
              </div>
              </div>
              {subtasks.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">Chưa có subtask.</p> :
                <div className="space-y-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((subtasks.filter((item) => item.status === 'DONE').length / subtasks.length) * 100)}%` }} />
                  </div>
                  {subtasks.map((subtask) => (
                    <div key={subtask.id} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${subtask.status === 'DONE' ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
                      <input className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" type="checkbox" checked={subtask.status === 'DONE'} onChange={() => void updateSubtaskStatus(subtask)} aria-label={`Hoàn thành ${subtask.title}`} />
                      <span className={`min-w-0 flex-1 text-xs font-semibold ${subtask.status === 'DONE' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{subtask.title}</span>
                      <span className="hidden text-[10px] text-slate-500 sm:block">{subtask.assignee ?? 'Chưa giao'}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{subtask.estimatedHours ?? 0}h</span>
                      <button type="button" onClick={() => void removeSubtask(subtask)} aria-label={`Xóa ${subtask.title}`} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>}
            </section>
          )}
          {activeTab === 'attachments' && isEdit && (
            <section className="space-y-4">
              <div tabIndex={0} onPaste={handlePaste} className="space-y-4 rounded-xl outline-none focus:ring-2 focus:ring-blue-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Ảnh phải nhỏ hơn 5 MB; PDF, tệp văn bản và Word (.docx) tối đa 8 MB. Có thể dán ảnh vào khu vực này.</p>
                <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 ${uploadingAttachments ? 'pointer-events-none opacity-60' : ''}`}>
                  <ImagePlus size={15} />{uploadingAttachments ? 'Đang tải...' : 'Thêm tệp'}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
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
                        <article key={attachment.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <button
                            type="button"
                            onClick={() => setPreviewAttachment(attachment)}
                            className="block w-full text-left hover:bg-slate-50"
                          >
                            {attachment.mimeType.startsWith('image/') ? (
                              <img src={dataUrl} alt={attachment.fileName} className="h-28 w-full object-cover" />
                            ) : (
                              <div className="flex h-28 items-center justify-center bg-slate-50 text-slate-500"><FileText size={30} /></div>
                            )}
                          </button>
                          <div className="space-y-1.5 border-t border-slate-100 px-2 py-2">
                            <span className="block truncate text-[11px] font-semibold text-slate-700" title={attachment.fileName}>{attachment.fileName}</span>
                            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                              <span>{attachment.fileName.split('.').pop()?.toUpperCase() ?? 'FILE'} · {formatAttachmentSize(attachment.fileSize)}</span>
                              <time dateTime={attachment.createdAt}>{new Date(attachment.createdAt).toLocaleString('vi-VN')}</time>
                            </div>
                            <div className="flex items-center justify-end gap-1">
                              <a href={dataUrl} target="_blank" rel="noreferrer" aria-label={`Mở ${attachment.fileName}`} title="Mở tệp" className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><FileText size={13} /></a>
                              <button type="button" onClick={() => void downloadAttachment(attachment)} aria-label={`Tải ${attachment.fileName}`} title="Tải xuống" className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Download size={13} /></button>
                              <button type="button" onClick={() => void removeAttachment(attachment)} aria-label={`Xóa ${attachment.fileName}`} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={13} /></button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>}
              </div>
            </section>
          )}
          </div>
          {isEdit && (
            <aside className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 xl:sticky xl:top-0">
              {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div>}
              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
                <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Thuộc tính</h3>
                <label className="block text-[11px] font-bold text-slate-600">Trạng thái
                  <SearchableSelect
                    ariaLabel="Trạng thái công việc"
                    className={`${inputClass} mt-1.5 bg-white`}
                    value={form.status}
                    onChange={(status) => update('status', status)}
                    clearable={false}
                    options={(isAdmin ? TASK_STATUSES : [form.status, ...STATUS_TRANSITIONS[form.status]]).map((status) => ({ value: status, label: STATUS_META[status].label }))}
                  />
                </label>
                <label className="block text-[11px] font-bold text-slate-600">Mức độ ưu tiên
                  <select
                    className={`${inputClass} mt-1.5 cursor-pointer bg-white`}
                    value={form.priority}
                    onChange={(event) => update('priority', event.target.value)}
                  >
                    {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{PRIORITY_META[priority].label}</option>)}
                  </select>
                </label>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-slate-600"><User size={13} /> Người phụ trách</label>
                  {!selectedProject ? <p className="text-xs text-slate-400">Chọn dự án để xem thành viên.</p> : (
                    <>
                    <input className={`${inputClass} mb-2 bg-white`} value={assigneeSearch} onChange={(event) => setAssigneeSearch(event.target.value)} placeholder="Tìm thành viên..." />
                    <SearchableSelect
                      ariaLabel="Lọc người phụ trách theo phòng ban"
                      className="mb-2 bg-white"
                      value={assigneeDepartment}
                      onChange={setAssigneeDepartment}
                      placeholder="Mọi phòng ban"
                      options={[{ value: '', label: 'Mọi phòng ban' }, ...departments.map((department) => ({ value: department, label: department }))]}
                    />
                    <div className="searchable-select-scrollbar max-h-40 space-y-1 overflow-y-auto">
                      {filteredProjectAssignees.map((assignee) => {
                        const checked = form.assigneeIds.includes(String(assignee.id));
                        return (
                          <label key={assignee.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs ${checked ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <input type="checkbox" checked={checked} onChange={(event) => toggleAssignee(String(assignee.id), event.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">{assignee.name.charAt(0).toUpperCase()}</span>
                            <span className="truncate">{assignee.name}</span>
                          </label>
                        );
                      })}
                      {filteredProjectAssignees.length === 0 && <p className="p-2 text-xs text-slate-400">Không có thành viên phù hợp.</p>}
                    </div>
                    </>
                  )}
                  {assigneeLoadError && <p className="mt-1 text-[10px] font-semibold text-rose-600">{assigneeLoadError}</p>}
                </div>
              </section>
              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
                <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400"><Clock size={13} /> Theo dõi thời gian</h3>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] font-bold text-slate-500">Ước tính (h)
                    <input type="number" min="0" step="0.25" className={`${inputClass} mt-1 bg-white`} value={form.estimatedHours} onChange={(event) => update('estimatedHours', event.target.value)} />
                  </label>
                  <label className="text-[10px] font-bold text-slate-500">Đã làm (h)
                    <input type="number" min="0" step="0.25" className={`${inputClass} mt-1 bg-white`} value={form.loggedHours} onChange={(event) => update('loggedHours', event.target.value)} />
                  </label>
                </div>
                <label className="block text-[10px] font-bold text-slate-600">Ngày bắt đầu
                  <input
                    type="date"
                    className={`${inputClass} mt-1 bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                    value={form.startDate}
                    onChange={(event) => update('startDate', event.target.value)}
                    disabled={isEdit && !isAdmin && task?.status !== 'TODO' && !(task?.status === 'PENDING' && form.status === 'TODO')}
                  />
                </label>
                <label className="block text-[10px] font-bold text-rose-600">Hạn chót
                  <input
                    type="date"
                    className={`${inputClass} mt-1 bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                    value={form.dueDate}
                    onChange={(event) => update('dueDate', event.target.value)}
                    disabled={isEdit && !isAdmin && task?.status !== 'TODO' && !(task?.status === 'PENDING' && form.status === 'TODO')}
                  />
                </label>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-bold text-emerald-700">Hoàn thành lúc</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {task?.completedAt
                      ? new Date(task.completedAt).toLocaleString()
                      : task && ['DONE', 'GOLIVE'].includes(task.status)
                        ? 'Không có dữ liệu thời điểm hoàn thành'
                        : 'Tự động ghi nhận khi chuyển sang Done'}
                  </p>
                </div>
                {!isAdmin && task?.status !== 'TODO' && !(task?.status === 'PENDING' && form.status === 'TODO') &&
                  <p className="text-[10px] text-slate-400">Chỉ có thể thay đổi ngày khi công việc ở trạng thái To Do.</p>}
              </section>
              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-xs font-extrabold text-white shadow-md shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-700 disabled:cursor-wait disabled:opacity-60"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Đang lưu...</> : 'Lưu thay đổi'}
              </button>
              <button type="button" onClick={onClose} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100">Đóng</button>
            </aside>
          )}
          </div>
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
    </ModalPortal>
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
    assigneeIds: 'đổi người phụ trách',
    estimatedDate: 'đổi ngày dự kiến',
    dueDate: 'đổi hạn chót',
    actualDate: 'cập nhật ngày hoàn thành',
    completedAt: 'ghi nhận thời điểm hoàn thành',
    deleted: 'xóa mềm công việc',
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