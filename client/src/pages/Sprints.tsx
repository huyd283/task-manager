import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Project, Task } from '../types';
import toast from 'react-hot-toast';
import SearchableSelect from '../components/common/SearchableSelect';

interface Sprint {
  id: number;
  projectId: number;
  name: string;
  startDate: string;
  endDate: string;
  goal: string | null;
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED';
  taskCount: number;
}

export default function Sprints() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedSprint, setSelectedSprint] = useState('');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<{ data: Project[] }>('/projects')
      .then((response) => setProjects(response.data.data ?? []))
      .catch(() => toast.error('Không tải được dự án.'));
  }, []);

  const loadProjectData = useCallback(async () => {
    if (!projectId) {
      setSprints([]);
      setTasks([]);
      return;
    }
    setLoading(true);
    try {
      const [sprintResponse, taskResponse] = await Promise.all([
        api.get<{ data: Sprint[] }>(`/projects/${projectId}/sprints`),
        api.get<{ data: Task[] }>('/tasks', { params: { projectId } }),
      ]);
      setSprints(sprintResponse.data.data);
      setTasks(taskResponse.data.data);
    } catch {
      toast.error('Không tải được sprint hoặc task của dự án.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadProjectData(); }, [loadProjectData]);

  const createSprint = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    try {
      await api.post(`/projects/${projectId}/sprints`, { name, startDate, endDate, goal });
      setName('');
      setStartDate('');
      setEndDate('');
      setGoal('');
      toast.success('Đã tạo sprint.');
      await loadProjectData();
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể tạo sprint.');
    }
  };

  const updateSprint = async (sprint: Sprint, status: 'ACTIVE' | 'COMPLETED') => {
    try {
      await api.patch(`/projects/${projectId}/sprints/${sprint.id}/status`, { status });
      toast.success(status === 'ACTIVE' ? 'Đã bắt đầu sprint.' : 'Đã đóng sprint; task chưa Golive đã chuyển về backlog.');
      await loadProjectData();
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể cập nhật sprint.');
    }
  };

  const assignTask = async (taskId: number, sprintId: string) => {
    if (!projectId || !sprintId) return;
    try {
      await api.post(`/projects/${projectId}/sprints/${sprintId}/tasks`, { taskId });
      await loadProjectData();
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể đưa task vào sprint.');
    }
  };

  const moveToBacklog = async (task: Task) => {
    if (!projectId || !task.sprintId) return;
    try {
      await api.delete(`/projects/${projectId}/sprints/${task.sprintId}/tasks/${task.id}`);
      await loadProjectData();
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Không thể chuyển task về backlog.');
    }
  };

  const backlog = tasks.filter((task) => task.sprintId === null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Quản lý Sprint</h1>
        <p className="mt-1 text-sm text-slate-500">Tạo sprint, chọn task từ backlog và quản lý vòng đời Scrum.</p>
      </header>

      <label className="grid max-w-lg gap-1 text-xs font-semibold text-slate-600">
        Dự án
        <SearchableSelect
          ariaLabel="Chọn dự án quản lý Sprint"
          value={projectId}
          onChange={(value) => { setProjectId(value); setSelectedSprint(''); }}
          placeholder="Chọn dự án..."
          className="text-sm"
          options={[
            { value: '', label: 'Chọn dự án...' },
            ...projects.map((project) => ({
              value: String(project.id),
              label: `${project.code} · ${project.name}`,
              keywords: project.code,
            })),
          ]}
        />
      </label>

      {projectId && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Các Sprint</h2>
            {loading ? <p className="text-sm text-slate-400">Đang tải...</p> : sprints.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">Chưa có sprint.</p> :
              sprints.map((sprint) => (
                <article key={sprint.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-900">{sprint.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{sprint.startDate} – {sprint.endDate} · {sprint.taskCount} task</p>
                      {sprint.goal && <p className="mt-2 text-sm text-slate-600">{sprint.goal}</p>}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{sprint.status}</span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {sprint.status === 'PLANNING' && <button onClick={() => void updateSprint(sprint, 'ACTIVE')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Start Sprint</button>}
                    {sprint.status === 'ACTIVE' && <button onClick={() => void updateSprint(sprint, 'COMPLETED')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Complete Sprint</button>}
                    {sprint.status !== 'COMPLETED' && (
                      <button onClick={() => setSelectedSprint(String(sprint.id))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
                        Chọn Sprint
                      </button>
                    )}
                  </div>
                </article>
              ))}

            <form onSubmit={(event) => void createSprint(event)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
              <h2 className="text-base font-bold text-slate-800 sm:col-span-2">Tạo Sprint</h2>
              <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Tên Sprint" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Mục tiêu Sprint" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white sm:col-span-2">Tạo Sprint</button>
            </form>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Backlog</h2>
            {sprints.some((sprint) => sprint.status === 'PLANNING' || sprint.status === 'ACTIVE') && (
              <SearchableSelect
                ariaLabel="Chọn Sprint để nhận task"
                value={selectedSprint}
                onChange={setSelectedSprint}
                placeholder="Chọn sprint để nhận task"
                className="w-full text-sm"
                options={[
                  { value: '', label: 'Chọn sprint để nhận task' },
                  ...sprints.filter((sprint) => sprint.status !== 'COMPLETED').map((sprint) => ({ value: String(sprint.id), label: sprint.name })),
                ]}
              />
            )}
            {backlog.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">Backlog trống.</p> :
              backlog.map((task) => (
                <article key={task.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{task.title}</p>
                    <p className="text-xs text-slate-400">{task.taskCode} · {task.estimatedHours ?? 0}h</p>
                  </div>
                  <button disabled={!selectedSprint} onClick={() => void assignTask(task.id, selectedSprint)} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-40">Thêm</button>
                </article>
              ))}
            <h3 className="pt-3 text-sm font-bold text-slate-700">Task trong Sprint</h3>
            {tasks.filter((task) => task.sprintId !== null).map((task) => (
              <article key={task.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{task.title}</p>
                  <p className="text-xs text-slate-400">{task.taskCode} · {task.status}</p>
                </div>
                <button onClick={() => void moveToBacklog(task)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Backlog</button>
              </article>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
