import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import toast from 'react-hot-toast';
import { TASK_STATUSES, STATUS_META, getDeadlineState, type Project, type Task } from '../types';
import { useAuth } from '../context/AuthContext';
import SearchableSelect from './common/SearchableSelect';
import TaskModal from './TaskModal';
import DailyCheckin from './DailyCheckin';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ListTodo,
  TrendingUp,
  UserCheck,
  Calendar,
  Sparkles,
  ArrowUpRight,
  Plus,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'personal' | 'project' | 'all'>('personal');
  const [projectFilter, setProjectFilter] = useState('');
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [checkinRefresh, setCheckinRefresh] = useState(0);

  const taskListUrl = (filters: { status?: string; alert?: string } = {}) => {
    const params = new URLSearchParams();
    if (filterMode === 'personal' && user) params.set('assigneeId', String(user.id));
    if (filterMode === 'project' && projectFilter) params.set('projectId', projectFilter);
    if (filters.status) params.set('status', filters.status);
    if (filters.alert) params.set('alert', filters.alert);
    const query = params.toString();
    return query ? `/tasks?${query}` : '/tasks';
  };

  const loadTasks = useCallback(async () => {
    if (filterMode === 'project' && !projectFilter) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = filterMode === 'personal' && user
        ? { assigneeId: user.id }
        : filterMode === 'project'
          ? { projectId: projectFilter }
          : {};
      const res = await api.get('/tasks', { params });
      // Đảm bảo lấy đúng mảng dữ liệu
      const fetchedTasks: Task[] = Array.isArray(res.data?.data) ? res.data.data : [];
      setTasks(fetchedTasks);
    } catch {
      console.error('Không thể tải dữ liệu dashboard');
      toast.error('Không thể tải dữ liệu dashboard.');
    } finally {
      setLoading(false);
    }
  }, [filterMode, projectFilter, user]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    api.get<{ data: Project[] }>('/projects')
      .then((response) => setProjects(response.data.data ?? []))
      .catch(() => toast.error('Không tải được danh sách dự án cho bộ lọc Dashboard.'));
  }, []);

  // 1. Tính toán KPI
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'GOLIVE').length;
  const totalEstimatedHours = tasks.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0);
  const totalLoggedHours = tasks.reduce((sum, task) => sum + task.loggedHours, 0);
  const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const overdueTasks = tasks.filter(
    (t) => getDeadlineState(t.dueDate, t.status) === 'overdue'
  ).length;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // 2. Dữ liệu cho Biểu đồ Tròn (PieChart Donut)
  const STATUS_COLORS: Record<string, string> = {
    TODO: '#94a3b8',
    IN_PROGRESS: '#3b82f6',
    DEV_DONE: '#8b5cf6',
    TESTING: '#f59e0b',
    TEST_FAIL: '#f43f5e',
    DONE: '#10b981',
    REVIEW: '#f59e0b',
    GOLIVE: '#7c3aed',
    PENDING: '#f43f5e',
  };

  const pieData = TASK_STATUSES.map((status) => {
    const count = tasks.filter((t) => t.status === status).length;
    return {
      name: STATUS_META[status]?.label ?? status,
      status,
      value: count,
      color: STATUS_COLORS[status] || '#cbd5e1',
    };
  }).filter((item) => item.value > 0);

  // 3. Dữ liệu cho Biểu đồ Cột (BarChart Dự án)
  const projectMap = new Map<number, { name: string; total: number; done: number }>();
  tasks.forEach((t) => {
    const project = projectMap.get(t.projectId) ?? {
      name: t.project?.trim() || 'Khác',
      total: 0,
      done: 0,
    };
    project.total += 1;
    if (t.status === 'GOLIVE') project.done += 1;
    projectMap.set(t.projectId, project);
  });

  const barData = [...projectMap].map(([projectId, project]) => ({
    projectId,
    name: project.name,
    'Tổng task': project.total,
    'Hoàn thành': project.done,
  }));

  // 4. Danh sách Task quá hạn
  const overdueList = tasks
    .filter((t) => getDeadlineState(t.dueDate, t.status) === 'overdue')
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-blue-600 via-indigo-600 to-violet-600" />
        <div className="pl-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Dashboard
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-600 border border-blue-100">
              <Sparkles size={12} />
              LIVE
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Tổng quan công việc · {filterMode === 'personal' ? 'Cá nhân' : filterMode === 'project' ? 'Dự án' : 'Toàn hệ thống'}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="dashboard-filter" className="text-xs font-bold text-slate-600">Phạm vi:</label>
          <select
            id="dashboard-filter"
            value={filterMode}
            onChange={(event) => {
              setFilterMode(event.target.value as 'personal' | 'project' | 'all');
              setProjectFilter('');
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="personal">Theo cá nhân</option>
            <option value="project">Theo dự án cụ thể</option>
            <option value="all">Toàn bộ dự án</option>
          </select>
          {filterMode === 'project' && (
            <SearchableSelect
              ariaLabel="Chọn dự án Dashboard"
              value={projectFilter}
              onChange={setProjectFilter}
              placeholder="Chọn dự án..."
              className="max-w-64"
              options={[
                { value: '', label: 'Chọn dự án...' },
                ...projects.map((project) => ({
                  value: String(project.id),
                  label: `${project.code} · ${project.name}`,
                  keywords: project.code,
                })),
              ]}
            />
          )}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600">
            <Calendar size={15} className="text-blue-600" />
            <span>Hôm nay: {new Date().toLocaleDateString('vi-VN')}</span>
          </div>
          <button
            type="button"
            onClick={() => setCreateTaskOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md"
          >
            <Plus size={15} /> Tạo Task
          </button>
        </div>
      </div>

      <DailyCheckin key={checkinRefresh} onCreateTask={() => setCreateTaskOpen(true)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => navigate(taskListUrl())}
          className="group rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Tổng Task</p>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:scale-110"><ListTodo size={20} /></span>
          </div>
          <p className="mt-4 text-5xl font-extrabold tracking-tight text-slate-950">{loading ? '—' : totalTasks}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700">Mở danh sách <ArrowUpRight size={14} /></span>
        </button>

        <button
          type="button"
          onClick={() => navigate(taskListUrl({ status: 'GOLIVE' }))}
          className="group rounded-2xl border border-emerald-200/80 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Hoàn thành</p>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600 transition group-hover:scale-110"><CheckCircle2 size={20} /></span>
          </div>
          <p className="mt-4 text-5xl font-extrabold tracking-tight text-emerald-600">{loading ? '—' : completedTasks}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><TrendingUp size={14} /> {completionRate}% · Xem Task</span>
        </button>

        <button
          type="button"
          onClick={() => navigate(taskListUrl({ status: 'IN_PROGRESS' }))}
          className="group rounded-2xl border border-blue-200/80 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Đang xử lý</p>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:scale-110"><Clock size={20} /></span>
          </div>
          <p className="mt-4 text-5xl font-extrabold tracking-tight text-blue-700">{loading ? '—' : inProgressTasks}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700">Mở danh sách <ArrowUpRight size={14} /></span>
        </button>

        <button
          type="button"
          onClick={() => navigate(taskListUrl({ alert: 'overdue' }))}
          className="group rounded-2xl border border-rose-200/80 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Quá hạn</p>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-rose-600 transition group-hover:scale-110"><AlertTriangle size={20} /></span>
          </div>
          <p className="mt-4 text-5xl font-extrabold tracking-tight text-rose-600">{loading ? '—' : overdueTasks}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-rose-700">Xử lý ngay <ArrowUpRight size={14} /></span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => navigate(taskListUrl())}
          className="group rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Giờ dự tính</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-blue-700">{loading ? '—' : `${totalEstimatedHours}h`}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700">Xem Task <ArrowUpRight size={14} /></span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/reports')}
          className="group rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Giờ đã ghi nhận</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-indigo-700">{loading ? '—' : `${totalLoggedHours}h`}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-700">Mở báo cáo <ArrowUpRight size={14} /></span>
        </button>
      </div>

      {/* Khu vực Biểu Đồ Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Biểu đồ tròn (Donut Chart) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Trạng thái công việc</h2>
            <p className="text-xs text-slate-400 mt-0.5">Phân bổ tỷ lệ các công việc</p>
          </div>

          <div className="h-64 my-2 w-full relative flex items-center justify-center">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span>Đang tải biểu đồ...</span>
              </div>
            ) : pieData.length === 0 ? (
              <div className="text-center text-xs text-slate-400 font-medium">Chưa có dữ liệu task</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                    onClick={(entry) => navigate(taskListUrl({ status: entry.status }))}
                    className="cursor-pointer"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} className="cursor-pointer" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}

            {/* Số % ở giữa Donut */}
            {!loading && totalTasks > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-slate-800">{completionRate}%</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Hoàn thành</span>
              </div>
            )}
          </div>

          {/* Legend tùy chỉnh phía dưới */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t border-slate-100">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span>{item.name}:</span>
                <strong className="text-slate-800">{item.value}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* Biểu đồ Cột (Bar Chart) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Khối lượng công việc theo Dự án</h2>
              <p className="text-xs text-slate-400 mt-0.5">So sánh tổng task và task đã hoàn thành</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
              <div className="flex items-center gap-1.5 text-slate-600">
                <span className="w-3 h-3 rounded-md bg-blue-300" />
                <span>Tổng task</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600">
                <span className="w-3 h-3 rounded-md bg-emerald-500" />
                <span>Hoàn thành</span>
              </div>
            </div>
          </div>

          <div className="h-64 my-2 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span>Đang tải biểu đồ...</span>
              </div>
            ) : barData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">
                Chưa có dữ liệu dự án
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{
                      backgroundColor: '#fff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="Tổng task"
                    fill="#93c5fd"
                    radius={[6, 6, 0, 0]}
                    barSize={18}
                    className="cursor-pointer"
                    onClick={(entry) => navigate(`/tasks?projectId=${entry.projectId}`)}
                  />
                  <Bar
                    dataKey="Hoàn thành"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                    barSize={18}
                    className="cursor-pointer"
                    onClick={(entry) => navigate(`/tasks?projectId=${entry.projectId}&status=GOLIVE`)}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Danh sách Công việc quá hạn */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-500" />
              <span>Công việc quá hạn chót cần xử lý gấp</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Danh sách các task quá hạn nhưng chưa hoàn thành</p>
          </div>
        </div>

        {overdueList.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 bg-slate-50/80 rounded-2xl border border-dashed border-slate-200 font-medium">
            🎉 Tuyệt vời! Tất cả công việc đều đúng tiến độ.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {overdueList.map((task) => (
              <div key={task.id} className="py-3 flex items-center justify-between gap-4 hover:bg-slate-50/60 px-3 rounded-xl transition-colors">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    {task.taskCode}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{task.title}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Dự án: {task.project || 'Chưa phân loại'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  {task.assignee && (
                    <div className="hidden sm:flex items-center gap-1.5 text-slate-600">
                      <UserCheck size={14} className="text-slate-400" />
                      <span className="font-semibold">{task.assignee}</span>
                    </div>
                  )}
                  <span className="font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200/60">
                    Hạn: {task.dueDate}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {createTaskOpen && (
        <TaskModal
          task={null}
          onClose={() => setCreateTaskOpen(false)}
          onSaved={() => {
            setCreateTaskOpen(false);
            void loadTasks();
            setCheckinRefresh((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}