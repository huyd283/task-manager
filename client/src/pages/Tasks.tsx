import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import TaskModal from '../components/TaskModal';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  STATUS_META,
  PRIORITY_META,
  getDeadlineState,
  getTaskPriority,
  type AssignableUser,
  type Project,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '../types';
import { Plus, Filter, Edit3, Trash2, Calendar, Folder, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/common/ConfirmModal';

export default function Tasks({ urgentOnly = false }: { urgentOnly?: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/tasks', {
        params: {
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(assigneeFilter ? { assigneeId: assigneeFilter } : {}),
          ...(projectFilter ? { projectId: projectFilter } : {}),
          ...(priorityFilter ? { priority: priorityFilter } : {}),
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
  }, [assigneeFilter, priorityFilter, projectFilter, statusFilter]);

  useEffect(() => {
    Promise.all([
      api.get<{ data: Project[] }>('/projects'),
      api.get<{ data: AssignableUser[] }>('/users/options'),
    ])
      .then(([projectResponse, assigneeResponse]) => {
        setProjects(projectResponse.data.data ?? []);
        setAssignees(assigneeResponse.data.data ?? []);
      })
      .catch(() => toast.error('Không tải được dữ liệu bộ lọc dự án và nhân sự.'));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (task: Task, status: TaskStatus) => {
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

  const visibleTasks = urgentOnly
    ? tasks.filter((task) => getDeadlineState(task.dueDate, task.status) !== null)
    : tasks;

  // Helper render màu badge trạng thái sống động
  const renderStatusBadge = (status: TaskStatus) => {
    const config: Record<string, { bg: string; text: string; border: string; dot: string }> = {
      TODO: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' },
      IN_PROGRESS: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/60', dot: 'bg-blue-500' },
      DEV_DONE: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200/60', dot: 'bg-violet-500' },
      TESTING: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/60', dot: 'bg-amber-500' },
      TEST_FAIL: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/60', dot: 'bg-rose-500' },
      DONE: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/60', dot: 'bg-emerald-500' },
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
              {visibleTasks.length}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {urgentOnly ? 'Các task sắp hết hạn trong 24 giờ hoặc đã quá hạn' : 'Quản lý và theo dõi tiến độ công việc dự án'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Bộ lọc danh sách task */}
          <div className="relative">
            <select
              className="pl-3 pr-8 py-2 text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer transition-all shadow-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')}
            >
              <option value="">Tất cả trạng thái</option>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
            <Filter size={14} className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" />
          </div>
          <select
            aria-label="Lọc theo người phụ trách"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
          >
            <option value="">Tất cả thành viên</option>
            {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
          </select>
          <select
            aria-label="Lọc theo dự án"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          >
            <option value="">Tất cả dự án</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code}</option>)}
          </select>
          <select
            aria-label="Lọc theo mức độ ưu tiên"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | '')}
          >
            <option value="">Mọi mức ưu tiên</option>
            {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{PRIORITY_META[priority].label}</option>)}
          </select>

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

      {/* 2. Bảng Dữ liệu */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1325px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[95px]" />
              <col className="w-[300px]" />
              <col className="w-[175px]" />
              <col className="w-[185px]" />
              <col className="w-[110px]" />
              <col className="w-[155px]" />
              <col className="w-[215px]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="whitespace-nowrap px-3 py-3.5">Mã</th>
                <th className="px-4 py-3.5">Tiêu đề</th>
                <th className="px-3 py-3.5">Dự án</th>
                <th className="px-3 py-3.5">Phụ trách</th>
                <th className="px-3 py-3.5">Ưu tiên</th>
                <th className="px-3 py-3.5">Trạng thái</th>
                <th className="whitespace-nowrap px-3 py-3.5">Hạn chót</th>
                <th className="whitespace-nowrap px-3 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2 font-medium">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Đang tải dữ liệu...</span>
                    </div>
                  </td>
                </tr>
              ) : visibleTasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
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
                        <select
                          value={task.status}
                          onChange={(e) => changeStatus(task, e.target.value as TaskStatus)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-700 shadow-sm outline-none transition-all hover:bg-slate-100 focus:ring-2 focus:ring-blue-500"
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_META[s].label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* Hạn chót */}
                    <td className="px-3 py-3.5 align-middle">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <Calendar
                          size={13}
                          className={`shrink-0 ${deadlineState === 'overdue' ? 'text-rose-500 animate-bounce' : deadlineState === 'soon' ? 'text-amber-500' : 'text-slate-400'}`}
                        />
                        <span
                          className={`whitespace-nowrap font-semibold ${
                            deadlineState === 'overdue'
                              ? 'text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/60'
                              : deadlineState === 'soon'
                                ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60'
                                : 'text-slate-600'
                          }`}
                        >
                          {task.dueDate ?? '—'}
                        </span>
                        {deadlineState && (
                          <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                            deadlineState === 'overdue' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {deadlineState === 'overdue' ? 'Quá hạn' : 'Sắp hết hạn'}
                          </span>
                        )}
                      </div>
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
                        <button
                          onClick={() => setPendingDelete(task)}
                          className="p-1.5 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg transition-colors"
                          title="Xóa công việc"
                        >
                          <Trash2 size={15} />
                        </button>
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
            Hiển thị <strong className="text-slate-700">{visibleTasks.length}</strong> công việc
          </span>
          <div className="flex gap-1.5">
            <button className="px-3 py-1 border border-slate-200 rounded-lg bg-white text-slate-400 cursor-not-allowed font-medium" disabled>
              Trước
            </button>
            <button className="px-3 py-1 border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 font-semibold shadow-sm">
              Sau
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

      <ConfirmModal
        open={pendingDelete !== null}
        title="Xóa công việc?"
        description={pendingDelete ? `Bạn sắp xóa ${pendingDelete.taskCode}. Thao tác này không thể hoàn tác.` : ''}
        confirmLabel="Xóa công việc"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete ? remove(pendingDelete) : undefined}
      />
    </div>
  );
}