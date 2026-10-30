import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import toast from 'react-hot-toast';
import { TASK_STATUSES, STATUS_META, getDeadlineState, type Project, type Task } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ListTodo,
  TrendingUp,
  FolderKanban,
  UserCheck,
  Calendar,
  Sparkles,
  ArrowUpRight,
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'personal' | 'project' | 'all'>('personal');
  const [projectFilter, setProjectFilter] = useState('');

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
  const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
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
    PENDING: '#f43f5e',
  };

  const pieData = TASK_STATUSES.map((status) => {
    const count = tasks.filter((t) => t.status === status).length;
    return {
      name: STATUS_META[status]?.label ?? status,
      value: count,
      color: STATUS_COLORS[status] || '#cbd5e1',
    };
  }).filter((item) => item.value > 0);

  // 3. Dữ liệu cho Biểu đồ Cột (BarChart Dự án)
  const projectMap: Record<string, { total: number; done: number }> = {};
  tasks.forEach((t) => {
    const proj = t.project?.trim() || 'Khác';
    if (!projectMap[proj]) projectMap[proj] = { total: 0, done: 0 };
    projectMap[proj].total += 1;
    if (t.status === 'DONE') projectMap[proj].done += 1;
  });

  const barData = Object.keys(projectMap).map((proj) => ({
    name: proj,
    'Tổng task': projectMap[proj].total,
    'Hoàn thành': projectMap[proj].done,
  }));

  // 4. Danh sách Task quá hạn
  const overdueList = tasks
    .filter((t) => getDeadlineState(t.dueDate, t.status) === 'overdue')
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-blue-600 via-indigo-600 to-violet-600" />
        <div className="pl-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Dashboard Thống Kê
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-600 border border-blue-100">
              <Sparkles size={12} />
              Real-time
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tổng quan tiến độ dự án, chỉ số hiệu suất và cảnh báo tiến độ
          </p>
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
            <select
              aria-label="Chọn dự án Dashboard"
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="max-w-64 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Chọn dự án...</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600">
            <Calendar size={15} className="text-blue-600" />
            <span>Hôm nay: {new Date().toLocaleDateString('vi-VN')}</span>
          </div>
        </div>
      </div>

      {/* 4 Thẻ KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tổng số Task */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Tổng công việc</p>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold group-hover:scale-110 transition-transform">
              <ListTodo size={20} />
            </div>
          </div>
          <h3 className="text-2xl font-extrabold text-slate-900 mt-2">{totalTasks}</h3>
          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
            <FolderKanban size={13} className="text-slate-400" />
            <span>{filterMode === 'personal' ? 'Task được giao cho bạn' : filterMode === 'project' ? 'Trong dự án đã chọn' : 'Trên toàn bộ dự án khả dụng'}</span>
          </p>
        </div>

        {/* Đã Hoàn Thành */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Đã hoàn thành</p>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold group-hover:scale-110 transition-transform">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <h3 className="text-2xl font-extrabold text-emerald-600 mt-2">{completedTasks}</h3>
          <p className="text-[11px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
            <TrendingUp size={13} />
            <span>Đạt {completionRate}% tỷ lệ hoàn thành</span>
          </p>
        </div>

        {/* Đang Xử Lý */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Đang xử lý</p>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold group-hover:scale-110 transition-transform">
              <Clock size={20} />
            </div>
          </div>
          <h3 className="text-2xl font-extrabold text-blue-600 mt-2">{inProgressTasks}</h3>
          <p className="text-[11px] text-slate-500 font-medium mt-1">Đang trong tiến trình thực hiện</p>
        </div>

        {/* Cảnh Báo Quá Hạn */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Quá hạn chót</p>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold group-hover:scale-110 transition-transform">
              <AlertTriangle size={20} />
            </div>
          </div>
          <h3 className="text-2xl font-extrabold text-rose-600 mt-2">{overdueTasks}</h3>
          <p className="text-[11px] text-rose-500 font-bold mt-1">Cần ưu tiên giải quyết gấp</p>
        </div>
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
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} cornerRadius={4} />
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
                  <Bar dataKey="Tổng task" fill="#93c5fd" radius={[6, 6, 0, 0]} barSize={18} />
                  <Bar dataKey="Hoàn thành" fill="#10b981" radius={[6, 6, 0, 0]} barSize={18} />
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
    </div>
  );
}