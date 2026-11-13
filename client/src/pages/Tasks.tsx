import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import TaskModal from '../components/TaskModal';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  STATUS_META,
  STATUS_TRANSITIONS,
  PRIORITY_META,
  getDeadlineState,
  getTaskPriority,
  type AssignableUser,
  type Project,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '../types';
import {
  Plus,
  Edit3,
  Trash2,
  Folder,
  AlertCircle,
  AlertTriangle,
  Clock3,
  PlayCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/common/ConfirmModal';
import SearchableSelect from '../components/common/SearchableSelect';
import { useAuth } from '../context/AuthContext';
import TaskDatePicker from '../components/common/TaskDatePicker';
import StartTaskModal from '../components/common/StartTaskModal';

type AlertFilter = 'overdue' | 'soon' | 'not-started';
type TaskSortField = 'taskCode' | 'title' | 'startDate' | 'dueDate';

export default function Tasks({ urgentOnly = false }: { urgentOnly?: boolean }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = user?.role === 'admin' || user?.isAccAdmin === true;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const initialStatus = searchParams.get('status');
  const initialAlert = searchParams.get('alert');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>(
    TASK_STATUSES.includes(initialStatus as TaskStatus) ? initialStatus as TaskStatus : '',
  );
  const [alertFilter, setAlertFilter] = useState<AlertFilter | null>(
    initialAlert === 'overdue' || initialAlert === 'soon' || initialAlert === 'not-started'
      ? initialAlert
      : null,
  );
  const [searchText, setSearchText] = useState('');
  const [sortField, setSortField] = useState<TaskSortField>('taskCode');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [assigneeFilter, setAssigneeFilter] = useState(searchParams.get('assigneeId') ?? '');
  const [projectFilter, setProjectFilter] = useState(searchParams.get('projectId') ?? '');
  const previousProjectFilter = useRef(projectFilter);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [pendingStart, setPendingStart] = useState<Task | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/tasks', {
        params: {
          ...(assigneeFilter ? { assigneeId: assigneeFilter } : {}),
          ...(projectFilter ? { projectId: projectFilter } : {}),
          ...(priorityFilter ? { priority: priorityFilter } : {}),
          ...(dueFrom ? { dueFrom } : {}),
          ...(dueTo ? { dueTo } : {}),
        },
      });
      setTasks(res.data.data);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Không tải được danh sách công việc';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [assigneeFilter, dueFrom, dueTo, priorityFilter, projectFilter]);

  useEffect(() => {
    Promise.all([
      api.get<{ data: Project[] }>('/projects'),
    ])
      .then(([projectResponse]) => {
        setProjects(projectResponse.data.data ?? []);
      })
      .catch(() => toast.error('Không tải được danh sách dự án cho bộ lọc.'));
  }, []);

  useEffect(() => {
    if (previousProjectFilter.current !== projectFilter) {
      previousProjectFilter.current = projectFilter;
      setAssigneeFilter('');
    }
    if (!projectFilter) {
      setAssignees([]);
      return;
    }
    api.get<{ data: AssignableUser[] }>(`/projects/${projectFilter}/members/options`)
      .then((response) => setAssignees(response.data.data ?? []))
      .catch(() => {
        setAssignees([]);
        toast.error('Không tải được thành viên của dự án đã chọn.');
      });
  }, [projectFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setCurrentPage(1);
  }, [alertFilter, assigneeFilter, dueFrom, dueTo, priorityFilter, projectFilter, searchText, statusFilter]);

  const changeStatus = async (task: Task, status: TaskStatus) => {
    if (!isAdmin && status === 'IN_PROGRESS' && task.status !== 'IN_PROGRESS') {
      setPendingStart(task);
      return;
    }
    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    const toastId = toast.loading('Đang cập nhật trạng thái...');
    try {
      await api.patch(`/tasks/${task.id}/status`, { status });
      toast.success(`Đã chuyển ${task.taskCode} sang ${STATUS_META[status].label}.`, { id: toastId });
      void load();
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể cập nhật trạng thái công việc.', { id: toastId });
      void load();
    }
  };

  const saveTaskDates = async (
    task: Task,
    field: 'startDate' | 'dueDate',
    value: string | null,
  ) => {
    try {
      await api.put(`/tasks/${task.id}`, { [field]: value });
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, [field]: value } : item));
      toast.success(`${field === 'startDate' ? 'Ngày bắt đầu' : 'Ngày kết thúc'} đã được cập nhật.`);
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể cập nhật ngày công việc.');
    }
  };

  const startTaskWithDates = async (task: Task, dates: { startDate: string; dueDate: string }) => {
    try {
      await api.patch(`/tasks/${task.id}/status`, { status: 'IN_PROGRESS', ...dates });
      toast.success(`Đã chuyển ${task.taskCode} sang ${STATUS_META.IN_PROGRESS.label}.`);
      setPendingStart(null);
      void load();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể cập nhật trạng thái công việc.';
      toast.error(message);
      throw new Error(message);
    }
  };

  const remove = async (task: Task) => {
    const toastId = toast.loading('Đang xóa công việc...');
    try {
      await api.delete(`/tasks/${task.id}`);
      toast.success(`Đã xóa công việc ${task.taskCode}.`, { id: toastId });
      setPendingDelete(null);
      void load();
      return true;
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể xóa công việc này.', { id: toastId });
      return false;
    }
  };

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setModalOpen(true);
  };

  const normalizedSearch = searchText.trim().toLocaleLowerCase();
  const searchableTasks = tasks.filter((task) => {
    const matchesSearch = !normalizedSearch || [
      task.taskCode,
      task.title,
      task.description,
      task.project,
      task.assignee,
      ...(task.assignees ?? []),
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
    return matchesSearch && (!urgentOnly || getDeadlineState(task.dueDate, task.status) !== null);
  });
  const statusCounts = new Map(
    TASK_STATUSES.map((status) => [
      status,
      searchableTasks.filter((task) => task.status === status).length,
    ]),
  );
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isNotStarted = (task: Task) =>
    task.status === 'TODO' && Boolean(task.startDate && task.startDate.slice(0, 10) <= today);
  const alertGroups = [
    {
      id: 'overdue' as const,
      title: 'Task quá hạn',
      description: 'Đã quá hạn nhưng chưa hoàn thành',
      icon: AlertTriangle,
      style: 'border-rose-200 bg-rose-50 text-rose-700',
      countStyle: 'bg-rose-100 text-rose-700',
      tasks: searchableTasks.filter((task) => getDeadlineState(task.dueDate, task.status) === 'overdue'),
    },
    {
      id: 'soon' as const,
      title: 'Task sắp đến hạn',
      description: 'Đến hạn trong 24 giờ tới',
      icon: Clock3,
      style: 'border-amber-200 bg-amber-50 text-amber-800',
      countStyle: 'bg-amber-100 text-amber-800',
      tasks: searchableTasks.filter((task) => getDeadlineState(task.dueDate, task.status) === 'soon'),
    },
    {
      id: 'not-started' as const,
      title: 'Task chưa bắt đầu',
      description: 'Đã đến ngày bắt đầu nhưng vẫn ở To Do',
      icon: PlayCircle,
      style: 'border-blue-200 bg-blue-50 text-blue-700',
      countStyle: 'bg-blue-100 text-blue-700',
      tasks: searchableTasks.filter(isNotStarted),
    },
  ].filter((group) => group.tasks.length > 0);
  const alertTotal = new Set(alertGroups.flatMap((group) => group.tasks.map((task) => task.id))).size;
  const matchesAlert = (task: Task) => {
    if (alertFilter === 'overdue') return getDeadlineState(task.dueDate, task.status) === 'overdue';
    if (alertFilter === 'soon') return getDeadlineState(task.dueDate, task.status) === 'soon';
    if (alertFilter === 'not-started') return isNotStarted(task);
    return true;
  };
  const matchingTasks = searchableTasks.filter((task) =>
    (!statusFilter || task.status === statusFilter) &&
    matchesAlert(task),
  );
  const sortedTasks = [...matchingTasks].sort((a, b) => {
    const first = a[sortField] ?? '';
    const second = b[sortField] ?? '';
    if (!first && second) return 1;
    if (first && !second) return -1;
    const result = String(first).localeCompare(String(second), undefined, { numeric: true, sensitivity: 'base' });
    return sortDirection === 'asc' ? result : -result;
  });
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(sortedTasks.length / pageSize));
  const page = Math.min(currentPage, pageCount);
  const visibleTasks = sortedTasks.slice((page - 1) * pageSize, page * pageSize);

  const sortBy = (field: TaskSortField) => {
    if (sortField === field) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'taskCode' ? 'desc' : 'asc');
    }
  };
  const renderSortIndicator = (field: TaskSortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  // Helper render màu badge trạng thái sống động
  const renderStatusBadge = (status: TaskStatus) => {
    const config: Record<string, { bg: string; text: string; border: string; dot: string }> = {
      TODO: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' },
      IN_PROGRESS: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/60', dot: 'bg-blue-500' },
      DEV_DONE: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200/60', dot: 'bg-violet-500' },
      TESTING: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/60', dot: 'bg-amber-500' },
      TEST_FAIL: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/60', dot: 'bg-rose-500' },
      DONE: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/60', dot: 'bg-emerald-500' },
      REVIEW: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200/60', dot: 'bg-amber-500' },
      GOLIVE: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200/60', dot: 'bg-purple-600' },
      PENDING: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/60', dot: 'bg-rose-500' },
    };

    const style = config[status] || { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-400' };

    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${style.bg} ${style.text} ${style.border}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot} animate-pulse`} />
        {STATUS_META[status]?.label ?? status}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Card với màu Gradient Accent */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-blue-500 via-indigo-500 to-violet-500" />
        
        <div className="pl-2">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            {urgentOnly ? 'Công việc gấp' : 'Công việc'}
            <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-50 text-blue-600 rounded-full border border-blue-100">
              {matchingTasks.length}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {urgentOnly ? 'Các task sắp hết hạn trong 24 giờ hoặc đã quá hạn' : 'Quản lý và theo dõi tiến độ công việc dự án'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Bộ lọc danh sách task */}
          <label className="relative min-w-48 flex-1 sm:flex-none">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Tìm kiếm công việc"
              placeholder="Tìm công việc..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <SearchableSelect
            ariaLabel="Lọc theo người phụ trách"
            className="min-w-48 bg-slate-50"
            placeholder={projectFilter ? 'Tất cả thành viên dự án' : 'Chọn dự án trước'}
            value={assigneeFilter}
            onChange={setAssigneeFilter}
            disabled={!projectFilter}
            options={[
              { value: '', label: 'Tất cả thành viên dự án' },
              ...assignees.map((assignee) => ({
                value: String(assignee.id),
                label: assignee.name,
                keywords: `${assignee.email} ${assignee.username ?? ''} ${assignee.employeeCode}`,
              })),
            ]}
          />
          <SearchableSelect
            ariaLabel="Lọc theo dự án"
            className="min-w-40 bg-slate-50"
            placeholder="Tất cả dự án"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { value: '', label: 'Tất cả dự án' },
              ...projects.map((project) => ({
                value: String(project.id),
                label: `${project.code} · ${project.name}`,
                keywords: project.code,
              })),
            ]}
          />
          <select
            aria-label="Lọc theo mức độ ưu tiên"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | '')}
          >
            <option value="">Mọi mức ưu tiên</option>
            {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{PRIORITY_META[priority].label}</option>)}
          </select>
          <input aria-label="Hạn chót từ" type="date" value={dueFrom} onChange={(event) => setDueFrom(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700" />
          <input aria-label="Hạn chót đến" type="date" value={dueTo} onChange={(event) => setDueTo(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700" />

          {/* Nút Tạo mới với hiệu ứng Shadow Gradient */}
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all active:scale-95"
          >
            <Plus size={16} />
            <span>Tạo công việc</span>
          </button>
        </div>
      </div>

      {/* Alert Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700 font-semibold shadow-sm">
          <AlertCircle size={16} className="text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-extrabold text-slate-900">Cần xử lý</h2>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${alertTotal > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {alertTotal} việc cần chú ý
          </span>
        </div>
        {alertGroups.length === 0 ? (
          <p className="px-5 py-3 text-xs font-medium text-slate-500">Không có công việc cần xử lý theo các bộ lọc hiện tại.</p>
        ) : (
          <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {alertGroups.map((group) => {
              const Icon = group.icon;
              const active = alertFilter === group.id;
              return (
                <button
                  type="button"
                  key={group.id}
                  aria-pressed={active}
                  onClick={() => {
                    setStatusFilter('');
                    setAlertFilter((current) => current === group.id ? null : group.id);
                  }}
                  className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors ${group.style} ${active ? 'ring-2 ring-current ring-offset-1' : 'hover:brightness-[0.98]'}`}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-extrabold ${group.countStyle}`}>{group.tasks.length}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-extrabold">{group.title}</span>
                    <span className="mt-0.5 block truncate text-[10px] opacity-80">{group.description}</span>
                  </span>
                  <ChevronRight size={15} className="shrink-0 opacity-60" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm">
        <div className="searchable-select-scrollbar flex gap-1 overflow-x-auto">
          <button
            type="button"
            aria-pressed={!statusFilter && !alertFilter}
            onClick={() => {
              setStatusFilter('');
              setAlertFilter(null);
            }}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${!statusFilter && !alertFilter ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Tất cả <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${!statusFilter && !alertFilter ? 'bg-white/15' : 'bg-slate-100 text-slate-500'}`}>{searchableTasks.length}</span>
          </button>
          {TASK_STATUSES.map((status) => {
            const active = statusFilter === status && !alertFilter;
            return (
              <button
                type="button"
                key={status}
                aria-pressed={active}
                onClick={() => {
                  setAlertFilter(null);
                  setStatusFilter((current) => current === status ? '' : status);
                }}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {STATUS_META[status].label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{statusCounts.get(status) ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Bảng Dữ liệu */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1450px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[95px]" />
              <col className="w-[250px]" />
              <col className="w-[145px]" />
              <col className="w-[160px]" />
              <col className="w-[100px]" />
              <col className="w-[150px]" />
              <col className="w-[105px]" />
              <col className="w-[200px]" />
              <col className="w-[85px]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="whitespace-nowrap px-3 py-3.5"><button type="button" onClick={() => sortBy('taskCode')} className="inline-flex items-center gap-1">Mã {renderSortIndicator('taskCode')}</button></th>
                <th className="px-4 py-3.5"><button type="button" onClick={() => sortBy('title')} className="inline-flex items-center gap-1">Tiêu đề {renderSortIndicator('title')}</button></th>
                <th className="px-3 py-3.5">Dự án</th>
                <th className="px-3 py-3.5">Phụ trách</th>
                <th className="px-3 py-3.5">Ưu tiên</th>
                <th className="px-3 py-3.5">Trạng thái</th>
                <th className="whitespace-nowrap px-3 py-3.5"><button type="button" onClick={() => sortBy('startDate')} className="inline-flex items-center gap-1">Bắt đầu {renderSortIndicator('startDate')}</button></th>
                <th className="whitespace-nowrap px-3 py-3.5"><button type="button" onClick={() => sortBy('dueDate')} className="inline-flex items-center gap-1">Dự kiến hoàn thành {renderSortIndicator('dueDate')}</button></th>
                <th className="whitespace-nowrap px-3 py-3.5">Est. / Logged</th>
                <th className="whitespace-nowrap px-3 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2 font-medium">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Đang tải dữ liệu...</span>
                    </div>
                  </td>
                </tr>
              ) : sortedTasks.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-medium">
                    Chưa có công việc nào trong danh sách
                  </td>
                </tr>
              ) : (
                visibleTasks.map((task) => {
                  const deadlineState = getDeadlineState(task.dueDate, task.status);
                  return (
                  <tr key={task.id} onClick={() => openEdit(task)} className={`group transition-colors hover:bg-blue-50/30 ${
                    deadlineState === 'overdue' ? 'bg-rose-50/40' : deadlineState === 'soon' ? 'bg-amber-50/40' : ''
                  }`}>
                    {/* Mã Task */}
                    <td className="whitespace-nowrap px-3 py-3.5 align-middle font-mono font-bold text-slate-500">
                      <span className="rounded bg-slate-100 px-2 py-1 transition-colors group-hover:bg-blue-100/60 group-hover:text-blue-700">
                        {task.taskCode}
                      </span>
                    </td>

                    {/* Tiêu đề */}
                    <td className="overflow-hidden px-4 py-3.5 align-middle">
                      <div
                        onClick={() => openEdit(task)}
                        title={task.title}
                        className="truncate font-bold text-slate-800 transition-colors hover:cursor-pointer hover:text-blue-600"
                      >
                        {task.title}
                      </div>
                      {task.description && (
                        <div title={task.description} className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{task.description}</div>
                      )}
                      {task.subtaskProgress > 0 && (
                        <div className="mt-1 text-[10px] font-semibold text-indigo-600">Subtask {task.subtaskProgress}%</div>
                      )}
                    </td>

                    {/* Dự án */}
                    <td className="overflow-hidden px-3 py-3.5 align-middle font-semibold text-slate-600">
                      {task.project ? (
                        <span className="flex min-w-0 items-center gap-1.5 text-slate-700" title={task.project}>
                          <Folder size={13} className="shrink-0 text-indigo-500" />
                          <span className="truncate">{task.project}</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Phụ trách */}
                    <td className="overflow-hidden px-3 py-3.5 align-middle">
                      {task.assignee || task.assignees?.length ? (
                        <div className="flex min-w-0 items-center gap-2" title={(task.assignees?.length ? task.assignees : [task.assignee]).join(', ')}>
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 to-orange-400 text-[10px] font-black text-white shadow-sm">
                            {(task.assignees?.[0] ?? task.assignee ?? '').charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate font-semibold text-slate-700">{(task.assignees?.length ? task.assignees : [task.assignee]).join(', ')}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Mức độ ưu tiên */}
                    <td className="px-3 py-3.5 align-middle">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold ${PRIORITY_META[getTaskPriority(task.priority)].badge}`}>
                        {PRIORITY_META[getTaskPriority(task.priority)].label}
                      </span>
                    </td>

                    {/* Trạng thái Select */}
                    <td className="px-3 py-3.5 align-middle">
                      <div className="relative block">
                        <div onClick={(event) => event.stopPropagation()}>
                          <SearchableSelect
                            ariaLabel={`Trạng thái ${task.taskCode}`}
                            value={task.status}
                            onChange={(value) => void changeStatus(task, value as TaskStatus)}
                            className="rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] font-bold"
                            options={(isAdmin ? TASK_STATUSES : [task.status, ...STATUS_TRANSITIONS[task.status]]).map((status) => ({
                              value: status,
                              label: STATUS_META[status].label,
                            }))}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-3 py-3.5 align-middle font-semibold">
                      <TaskDatePicker
                        label={`Ngày bắt đầu ${task.taskCode}`}
                        value={task.startDate}
                        editable={isAdmin || task.status === 'TODO'}
                        onSave={(value) => saveTaskDates(task, 'startDate', value)}
                      />
                    </td>

                    {/* Hạn chót */}
                    <td className="px-3 py-3.5 align-middle" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <TaskDatePicker
                          label={`Ngày kết thúc ${task.taskCode}`}
                          value={task.dueDate}
                          editable={isAdmin || task.status === 'TODO'}
                          tone={deadlineState ?? 'default'}
                          onSave={(value) => saveTaskDates(task, 'dueDate', value)}
                        />
                        {deadlineState && (
                          <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                            deadlineState === 'overdue' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {deadlineState === 'overdue' ? 'Quá hạn' : 'Sắp hết hạn'}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-3 py-3.5 align-middle font-semibold text-slate-600">
                      {task.estimatedHours == null ? '—' : `${task.estimatedHours}h`} / {task.loggedHours}h
                    </td>

                    {/* Thao tác */}
                    <td className="px-3 py-3.5 align-middle text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(task)}
                          className="p-1.5 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded-lg transition-colors"
                          title="Sửa công việc"
                        >
                          <Edit3 size={15} />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => setPendingDelete(task)}
                            className="p-1.5 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg transition-colors"
                            title="Xóa công việc"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Phân trang */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500">
          <span>
            {sortedTasks.length === 0 ? 'Không có công việc' : `Hiển thị ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, sortedTasks.length)} / ${sortedTasks.length} công việc`}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
              className="inline-flex items-center gap-1 px-3 py-1 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 font-medium"
              disabled={page <= 1}
            >
              <ChevronLeft size={13} /> Trước
            </button>
            <span className="px-2 py-1 font-semibold text-slate-500">{page} / {pageCount}</span>
            <button
              onClick={() => setCurrentPage((current) => Math.min(pageCount, current + 1))}
              className="inline-flex items-center gap-1 px-3 py-1 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 font-medium"
              disabled={page >= pageCount}
            >
              Sau <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Chú thích trạng thái (Status Badges Legend) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Trạng thái khả dụng
        </div>
        <div className="flex flex-wrap gap-3">
          {TASK_STATUSES.map((s) => (
            <div key={s}>{renderStatusBadge(s)}</div>
          ))}
        </div>
      </div>

      {/* Task Modal */}
      {modalOpen && (
        <TaskModal
          task={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void load();
          }}
        />
      )}

      {pendingStart && (
        <StartTaskModal
          task={pendingStart}
          onCancel={() => setPendingStart(null)}
          onConfirm={(dates) => startTaskWithDates(pendingStart, dates)}
        />
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title="Xóa công việc?"
        description={pendingDelete ? `${pendingDelete.taskCode} sẽ được ẩn khỏi danh sách đang hoạt động; lịch sử và dữ liệu liên quan được giữ lại.` : ''}
        confirmLabel="Xóa công việc"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete ? remove(pendingDelete) : undefined}
      />
    </div>
  );
}