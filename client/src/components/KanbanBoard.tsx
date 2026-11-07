import { useCallback, useEffect, useRef, useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult, type DroppableProvided, type DroppableStateSnapshot } from '@hello-pangea/dnd';
import { api } from '../api/client';
import { TASK_STATUSES, STATUS_META, STATUS_TRANSITIONS, TASK_PRIORITIES, PRIORITY_META, getDeadlineState, type Project, type Task, type TaskStatus, type TaskPriority } from '../types';
import { Plus, Calendar, AlertCircle, Search, Flag, Clock3, CircleCheck } from 'lucide-react';
import TaskModal from '../components/TaskModal';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import SearchableSelect, { normalizeSearchText } from './common/SearchableSelect';

export default function KanbanBoard() {
  const { user } = useAuth();
  const canViewSystem = user?.role === 'admin' || user?.jobTitle === 'Project Lead';
  const isAdmin = user?.role === 'admin';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const [taskSearch, setTaskSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'mine' | 'projects' | 'system'>('projects');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const effectiveScope = isAdmin ? 'system' : scopeFilter;
  const assigneeOptions = [...new Set(tasks.flatMap((task) => task.assignees?.length ? task.assignees : task.assignee ? [task.assignee] : []))].sort();
  const visibleTasks = tasks.filter((task) => {
    const names = task.assignees?.length ? task.assignees : task.assignee ? [task.assignee] : [];
    const query = normalizeSearchText(taskSearch.trim());
    return (!priorityFilter || task.priority === priorityFilter) &&
      (!assigneeFilter || names.includes(assigneeFilter)) &&
      (!query || normalizeSearchText(`${task.taskCode} ${task.title} ${task.project ?? ''}`).includes(query));
  });

  useEffect(() => {
    if (!dragging) return;

    const scrollAtPointer = (clientX: number) => {
      const board = boardRef.current;
      if (!board) return;
      const bounds = board.getBoundingClientRect();
      const edgeSize = 72;
      if (clientX < bounds.left + edgeSize && board.scrollLeft > 0) {
        const distance = Math.min(1, (bounds.left + edgeSize - clientX) / edgeSize);
        board.scrollLeft -= Math.ceil(distance * 24);
      } else if (clientX > bounds.right - edgeSize && board.scrollLeft < board.scrollWidth - board.clientWidth) {
        const distance = Math.min(1, (clientX - (bounds.right - edgeSize)) / edgeSize);
        board.scrollLeft += Math.ceil(distance * 24);
      }
    };
    const handleMouseMove = (event: MouseEvent) => scrollAtPointer(event.clientX);
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) scrollAtPointer(touch.clientX);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [dragging]);

  // Tải danh sách công việc
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = {};
      if (projectFilter) params.projectId = projectFilter;
      if (effectiveScope === 'mine' && user) params.assigneeId = user.id;
      if (effectiveScope === 'projects') params.scope = 'projects';
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
  }, [effectiveScope, projectFilter, user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Xử lý sự kiện Kéo & Thả (Drag & Drop)
  const onDragEnd = async (result: DropResult) => {
    setDragging(false);
    const { destination, source, draggableId } = result;

    // Không kéo thả vào đâu hoặc thả lại đúng vị trí cũ
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    if (destination.droppableId === source.droppableId) return;

    const taskId = Number(draggableId);
    const newStatus = destination.droppableId as TaskStatus;
    const task = tasks.find((item) => item.id === taskId);
    if (!TASK_STATUSES.includes(newStatus) || !task) {
      toast.error('Không tìm thấy công việc hoặc trạng thái đích không hợp lệ.');
      return;
    }
    if (!STATUS_TRANSITIONS[task.status].includes(newStatus)) {
      toast.error(`Không thể chuyển trực tiếp từ ${STATUS_META[task.status].label} sang ${STATUS_META[newStatus].label}.`);
      return;
    }

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
    REVIEW: { bg: 'bg-amber-50/70', text: 'text-amber-800', badge: 'bg-amber-200/80 text-amber-900' },
    GOLIVE: { bg: 'bg-purple-50/70', text: 'text-purple-800', badge: 'bg-purple-200/80 text-purple-900' },
    PENDING: { bg: 'bg-rose-50/70', text: 'text-rose-700', badge: 'bg-rose-200/80 text-rose-800' },
  };
  const scopeOptions = isAdmin
    ? [['system', 'Toàn bộ hệ thống']] as const
    : [
      ['mine', 'Task của tôi'],
      ['projects', 'Task dự án'],
      ...(canViewSystem ? [['system', 'Toàn bộ hệ thống'] as const] : []),
    ] as const;

  return (
    <div className="space-y-6">
      {/* Header Trang Kanban */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-blue-500 via-indigo-500 to-violet-500" />
        
        <div className="pl-2">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Bảng Kanban
            <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-50 text-blue-600 rounded-full border border-blue-100">
              {visibleTasks.length}
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
          {scopeOptions.map(([scope, label]) => (
              <button
                key={scope}
                type="button"
                onClick={() => setScopeFilter(scope)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  effectiveScope === scope ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
          ))}
        </div>
        <label htmlFor="kanban-project-filter" className="text-xs font-bold text-slate-600">Lọc theo dự án</label>
        <SearchableSelect
          ariaLabel="Lọc Kanban theo dự án"
          className="min-w-52 bg-slate-50"
          value={projectFilter}
          onChange={setProjectFilter}
          placeholder="Tất cả dự án"
          options={[
            { value: '', label: 'Tất cả dự án' },
            ...projects.map((project) => ({
              value: String(project.id),
              label: `${project.code} · ${project.name}`,
              keywords: project.code,
            })),
          ]}
        />
        <label className="relative min-w-48 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={taskSearch}
            onChange={(event) => setTaskSearch(event.target.value)}
            aria-label="Tìm công việc trên Kanban"
            placeholder="Tìm mã, tiêu đề, dự án..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
        </label>
        <SearchableSelect
          ariaLabel="Lọc Kanban theo người phụ trách"
          className="min-w-44 bg-slate-50"
          value={assigneeFilter}
          onChange={setAssigneeFilter}
          placeholder="Mọi thành viên"
          options={[
            { value: '', label: 'Mọi thành viên' },
            ...assigneeOptions.map((name) => ({ value: name, label: name })),
          ]}
        />
        <SearchableSelect
          ariaLabel="Lọc Kanban theo mức độ ưu tiên"
          className="min-w-40 bg-slate-50"
          value={priorityFilter}
          onChange={(value) => setPriorityFilter(value as TaskPriority | '')}
          placeholder="Mọi ưu tiên"
          options={[
            { value: '', label: 'Mọi ưu tiên' },
            ...TASK_PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_META[priority].label })),
          ]}
        />
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
        <DragDropContext onDragStart={() => setDragging(true)} onDragEnd={onDragEnd}>
          <div
            ref={boardRef}
            className="flex items-start gap-4 overflow-x-auto overscroll-x-contain pb-4"
          >
            {TASK_STATUSES.map((status) => {
              const columnTasks = visibleTasks.filter((t) => t.status === status);
              const headerStyle = columnHeaderStyle[status] || {
                bg: 'bg-slate-100',
                text: 'text-slate-700',
                badge: 'bg-slate-200 text-slate-700',
              };

              return (
                <div
                  key={status}
                  className={`w-[292px] shrink-0 rounded-2xl border p-3 flex flex-col max-h-[calc(100vh-250px)] min-w-[260px] transition-colors ${
                    status === 'GOLIVE' ? 'border-purple-200 bg-purple-50/50' : 'border-slate-200/80 bg-slate-100/70'
                  }`}
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
                        className={`searchable-select-scrollbar flex-1 overflow-y-auto space-y-3 p-1 transition-colors rounded-xl min-h-[140px] ${
                          snapshot.isDraggingOver ? 'bg-blue-50/70 ring-2 ring-blue-400/50 ring-dashed shadow-inner' : ''
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
                                className={`group/card bg-white p-3.5 rounded-xl border shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-grab active:cursor-grabbing select-none ${
                                  getDeadlineState(task.dueDate, task.status) === 'overdue' ? 'border-rose-300 ring-1 ring-rose-100' :
                                    getDeadlineState(task.dueDate, task.status) === 'soon' ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200/80'
                                } ${
                                  snapshot.isDragging ? 'shadow-xl ring-2 ring-blue-500/50 rotate-1 scale-105 z-50' : ''
                                }`}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <span className="font-mono text-[10px] font-bold tracking-wide text-slate-500">
                                    {task.taskCode}
                                  </span>
                                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${PRIORITY_META[task.priority].badge}`}>
                                    <Flag size={10} />{PRIORITY_META[task.priority].label}
                                  </span>
                                </div>
                                <h4 className="mb-2 line-clamp-2 text-[13px] font-bold leading-snug text-slate-800 group-hover/card:text-blue-700">
                                  {task.title}
                                </h4>
                                <div className="mb-3 flex items-center gap-1.5">
                                  {task.project && (
                                    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">
                                      <span className="truncate">{task.project}</span>
                                    </span>
                                  )}
                                </div>
                                {task.subtaskProgress > 0 && (
                                  <div className="mb-3">
                                    <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-500">
                                      <span className="inline-flex items-center gap-1"><CircleCheck size={11} /> Subtasks</span>
                                      <span>{task.subtaskProgress}%</span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(100, task.subtaskProgress)}%` }} />
                                    </div>
                                  </div>
                                )}
                                <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[11px]">
                                  {(() => {
                                    const assignees = task.assignees?.length
                                      ? task.assignees
                                      : task.assignee ? [task.assignee] : [];
                                    return assignees.length > 0 ? (
                                      <div className="flex min-w-0 flex-1 items-center gap-1.5" title={assignees.join(', ')}>
                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-[9px] font-black text-white ring-2 ring-white">
                                          {assignees[0].charAt(0).toUpperCase()}
                                        </div>
                                        <span className="min-w-0 truncate font-semibold text-slate-600">
                                          {assignees.length > 1 ? `${assignees[0]} +${assignees.length - 1}` : assignees[0]}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] font-medium text-slate-400">Chưa giao</span>
                                    );
                                  })()}

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
                                          <span>{task.dueDate.slice(5, 10)}</span>
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
                                <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-slate-400">
                                  <Clock3 size={11} />
                                  {task.estimatedHours == null ? 'Chưa ước tính' : `${task.estimatedHours}h ước tính`}
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