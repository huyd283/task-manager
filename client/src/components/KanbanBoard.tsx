import { useCallback, useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult, type DroppableProvided, type DroppableStateSnapshot } from '@hello-pangea/dnd';
import { api } from '../api/client';
import { TASK_STATUSES, STATUS_META, getDeadlineState, type Project, type Task, type TaskStatus } from '../types';
import { Plus, Calendar, AlertCircle, MoreHorizontal } from 'lucide-react';
import TaskModal from '../components/TaskModal';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function KanbanBoard() {
  const { user } = useAuth();
  const canViewSystem = user?.role === 'admin' || user?.jobTitle === 'Project Lead';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'mine' | 'projects' | 'system'>('projects');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Tải danh sách công việc
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = {};
      if (projectFilter) params.projectId = projectFilter;
      if (scopeFilter === 'mine' && user) params.assigneeId = user.id;
      if (scopeFilter === 'projects') params.scope = 'projects';
      const [res, projectResponse] = await Promise.all([
        api.get('/tasks', { params }),
        api.get<{ data: Project[] }>('/projects'),
      ]);
      setTasks(res.data.data);
      setProjects(projectResponse.data.data ?? []);
    } catch (err) {
      setError('Không thể tải danh sách công việc');
      toast.error('Không thể tải danh sách công việc.');
    } finally {
      setLoading(false);
    }
  }, [projectFilter, scopeFilter, user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Xử lý sự kiện Kéo & Thả (Drag & Drop)
  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Không kéo thả vào đâu hoặc thả lại đúng vị trí cũ
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const taskId = Number(draggableId);
    const newStatus = destination.droppableId as TaskStatus;

    // Optimistic Update: Cập nhật giao diện ngay lập tức
    setTasks((prevTasks) =>
      prevTasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    // Gọi API cập nhật backend
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
      toast.success(`Đã chuyển công việc sang ${STATUS_META[newStatus].label}.`);
    } catch (err) {
      // Nếu lỗi thì tải lại dữ liệu cũ
      toast.error((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể cập nhật trạng thái công việc.');
      void load();
    }
  };

  // Style cho từng cột trạng thái
  const columnHeaderStyle: Record<string, { bg: string; text: string; badge: string }> = {
    TODO: { bg: 'bg-slate-100', text: 'text-slate-700', badge: 'bg-slate-200 text-slate-700' },
    IN_PROGRESS: { bg: 'bg-blue-50/70', text: 'text-blue-700', badge: 'bg-blue-200/80 text-blue-800' },
    DEV_DONE: { bg: 'bg-violet-50/70', text: 'text-violet-700', badge: 'bg-violet-200/80 text-violet-800' },
    TESTING: { bg: 'bg-amber-50/70', text: 'text-amber-700', badge: 'bg-amber-200/80 text-amber-800' },
    TEST_FAIL: { bg: 'bg-rose-50/70', text: 'text-rose-700', badge: 'bg-rose-200/80 text-rose-800' },
    DONE: { bg: 'bg-emerald-50/70', text: 'text-emerald-700', badge: 'bg-emerald-200/80 text-emerald-800' },
    PENDING: { bg: 'bg-rose-50/70', text: 'text-rose-700', badge: 'bg-rose-200/80 text-rose-800' },
  };

  return (
    <div className="space-y-6">
      {/* Header Trang Kanban */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-blue-500 via-indigo-500 to-violet-500" />
        
        <div className="pl-2">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Bảng Kanban
            <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-50 text-blue-600 rounded-full border border-blue-100">
              {tasks.length}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">Kéo thả thẻ công việc giữa các cột để cập nhật trạng thái nhanh chóng</p>
        </div>

        <button
          onClick={() => {
            setEditingTask(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all active:scale-95"
        >
          <Plus size={16} />
          <span>Tạo công việc</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Phạm vi công việc">
          {([
            ['mine', 'Task của tôi'],
            ['projects', 'Task dự án'],
            ['system', 'Toàn bộ hệ thống'],
          ] as const).map(([scope, label]) => {
            const disabled = scope === 'system' && !canViewSystem;
            return (
              <button
                key={scope}
                type="button"
                onClick={() => setScopeFilter(scope)}
                disabled={disabled}
                title={disabled ? 'Chỉ admin hoặc Project Lead được xem toàn hệ thống.' : undefined}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  scopeFilter === scope ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                } ${disabled ? 'cursor-not-allowed opacity-50 hover:text-slate-500' : ''}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <label htmlFor="kanban-project-filter" className="text-xs font-bold text-slate-600">Lọc theo dự án</label>
        <select
          id="kanban-project-filter"
          className="min-w-52 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
        >
          <option value="">Tất cả dự án</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700 font-semibold">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Khu vực Bảng Kanban (DragDropContext) */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 font-medium">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <span>Đang tải bảng công việc...</span>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex items-start gap-4 overflow-x-auto pb-4">
            {TASK_STATUSES.map((status) => {
              const columnTasks = tasks.filter((t) => t.status === status);
              const headerStyle = columnHeaderStyle[status] || {
                bg: 'bg-slate-100',
                text: 'text-slate-700',
                badge: 'bg-slate-200 text-slate-700',
              };

              return (
                <div
                  key={status}
                  className="w-[280px] shrink-0 bg-slate-100/70 rounded-2xl p-3 border border-slate-200/80 flex flex-col max-h-[calc(100vh-220px)] min-w-[260px]"
                >
                  {/* Tên Cột Trạng Thái */}
                  <div className={`flex items-center justify-between p-2.5 rounded-xl mb-3 ${headerStyle.bg}`}>
                    <span className={`text-xs font-bold ${headerStyle.text}`}>
                      {STATUS_META[status]?.label ?? status}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${headerStyle?.badge}`}>
                      {columnTasks.length}
                    </span>
                  </div>

                  {/* Vùng thả Task (Droppable) */}
                  <Droppable droppableId={status}>
                    {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 overflow-y-auto space-y-3 p-1 transition-colors rounded-xl min-h-[120px] ${
                          snapshot.isDraggingOver ? 'bg-blue-50/50 ring-2 ring-blue-400/30 ring-dashed' : ''
                        }`}
                      >
                        {columnTasks.map((task, index) => (
                          <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => {
                                  setEditingTask(task);
                                  setModalOpen(true);
                                }}
                                className={`bg-white p-3.5 rounded-xl border shadow-xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none ${
                                  getDeadlineState(task.dueDate, task.status) === 'overdue' ? 'border-rose-300 ring-1 ring-rose-100' :
                                    getDeadlineState(task.dueDate, task.status) === 'soon' ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200/80'
                                } ${
                                  snapshot.isDragging ? 'shadow-xl ring-2 ring-blue-500/50 rotate-1 scale-105 z-50' : ''
                                }`}
                              >
                                {/* Mã Task & Dự án */}
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="font-mono text-[11px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                    {task.taskCode}
                                  </span>
                                  {task.project && (
                                    <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md truncate max-w-[110px]">
                                      {task.project}
                                    </span>
                                  )}
                                </div>

                                {/* Tiêu đề Task */}
                                <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug mb-2">
                                  {task.title}
                                </h4>

                                {/* Phụ trách & Hạn chót */}
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                                  {/* User Avatar */}
                                  {task.assignee ? (
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-400 to-orange-400 text-white text-[9px] font-black flex items-center justify-center">
                                        {task.assignee.charAt(0).toUpperCase()}
                                      </div>
                                      <span className="font-semibold text-slate-600 truncate max-w-[80px]">
                                        {task.assignee}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}

                                  {/* Due Date */}
                                  {task.dueDate && (
                                    (() => {
                                      const deadlineState = getDeadlineState(task.dueDate, task.status);
                                      return (
                                        <div className={`flex items-center gap-1 font-semibold ${
                                          deadlineState === 'overdue' ? 'text-rose-600 font-bold' :
                                            deadlineState === 'soon' ? 'text-amber-600 font-bold' : 'text-slate-400'
                                        }`}>
                                          <Calendar size={12} />
                                          <span>{task.dueDate.slice(5)}</span>
                                          {deadlineState && (
                                            <span className={`rounded px-1 py-0.5 text-[9px] ${
                                              deadlineState === 'overdue' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                                            }`}>{deadlineState === 'overdue' ? 'Quá hạn' : 'Sắp hạn'}</span>
                                          )}
                                        </div>
                                      );
                                    })()
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Task Modal để Sửa/Tạo mới */}
      {modalOpen && (
        <TaskModal
          task={editingTask}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}