import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import TaskModal from '../components/TaskModal';
import { TASK_STATUSES, STATUS_META, type Task, type TaskStatus } from '../types';
import { Plus, Filter, Edit3, Trash2, Calendar, Folder, UserCheck, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/common/ConfirmModal';

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/tasks', {
        params: statusFilter ? { status: statusFilter } : {},
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
  }, [statusFilter]);

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

  const isOverdue = (task: Task) =>
    task.status !== 'DONE' && task.dueDate !== null && task.dueDate < new Date().toISOString().slice(0, 10);

  // Helper render màu badge trạng thái sống động
  const renderStatusBadge = (status: TaskStatus) => {
    const config: Record<string, { bg: string; text: string; border: string; dot: string }> = {
      TODO: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' },
      IN_PROGRESS: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/60', dot: 'bg-blue-500' },
      IN_REVIEW: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/60', dot: 'bg-amber-500' },
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
            Công việc
            <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-50 text-blue-600 rounded-full border border-blue-100">
              {tasks.length}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">Quản lý và theo dõi tiến độ công việc dự án</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Bộ lọc trạng thái */}
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
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4 w-24">Mã</th>
                <th className="py-3.5 px-4 min-w-[220px]">Tiêu đề</th>
                <th className="py-3.5 px-4">Dự án</th>
                <th className="py-3.5 px-4">Phụ trách</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4">Hạn chót</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2 font-medium">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Đang tải dữ liệu...</span>
                    </div>
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    Chưa có công việc nào trong danh sách
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-blue-50/30 transition-colors group">
                    {/* Mã Task */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-500">
                      <span className="bg-slate-100 group-hover:bg-blue-100/60 group-hover:text-blue-700 px-2 py-0.5 rounded transition-colors">
                        {task.taskCode}
                      </span>
                    </td>

                    {/* Tiêu đề */}
                    <td className="py-3.5 px-4">
                      <div
                        onClick={() => openEdit(task)}
                        className="font-bold text-slate-800 hover:text-blue-600 cursor-pointer transition-colors"
                      >
                        {task.title}
                      </div>
                      {task.description && (
                        <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{task.description}</div>
                      )}
                    </td>

                    {/* Dự án */}
                    <td className="py-3.5 px-4 font-semibold text-slate-600">
                      {task.project ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-700">
                          <Folder size={13} className="text-indigo-500" />
                          {task.project}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Phụ trách */}
                    <td className="py-3.5 px-4">
                      {task.assignee ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-400 to-orange-400 text-white text-[10px] font-black flex items-center justify-center shadow-sm">
                            {task.assignee.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-slate-700">{task.assignee}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Trạng thái Select */}
                    <td className="py-3.5 px-4">
                      <div className="relative inline-block">
                        <select
                          value={task.status}
                          onChange={(e) => changeStatus(task, e.target.value as TaskStatus)}
                          className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm transition-all"
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
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <Calendar
                          size={13}
                          className={isOverdue(task) ? 'text-rose-500 animate-bounce' : 'text-slate-400'}
                        />
                        <span
                          className={`font-semibold ${
                            isOverdue(task)
                              ? 'text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/60'
                              : 'text-slate-600'
                          }`}
                        >
                          {task.dueDate ?? '—'}
                        </span>
                      </div>
                    </td>

                    {/* Thao tác */}
                    <td className="py-3.5 px-4 text-right">
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
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Phân trang */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500">
          <span>
            Hiển thị <strong className="text-slate-700">{tasks.length}</strong> công việc
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