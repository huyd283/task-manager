import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { PRIORITY_META, STATUS_META, type Project, type Task } from '../types';
import toast from 'react-hot-toast';
import SearchableSelect from '../components/common/SearchableSelect';
import { Flag, Search } from 'lucide-react';

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
  const [backlogSearch, setBacklogSearch] = useState('');
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
  const filteredBacklog = backlog.filter((task) => {
    const query = backlogSearch.trim().toLocaleLowerCase();
    return !query || [task.taskCode, task.title, task.assignee, ...(task.assignees ?? [])]
      .some((value) => value?.toLocaleLowerCase().includes(query));
  });
  const sprintTasks = tasks.filter((task) => task.sprintId !== null && task.status !== 'DONE');

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
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Backlog</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">{filteredBacklog.length}</span>
            </div>
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
            <label className="relative block">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={backlogSearch}
                onChange={(event) => setBacklogSearch(event.target.value)}
                aria-label="Tìm kiếm task trong Backlog"
                placeholder="Tìm theo mã, tiêu đề hoặc người phụ trách..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            </label>
            <div className="searchable-select-scrollbar max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {filteredBacklog.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">
                  {backlog.length ? 'Không tìm thấy task phù hợp.' : 'Backlog trống.'}
                </p>
              ) : filteredBacklog.map((task) => {
                const assignees = task.assignees?.length ? task.assignees : task.assignee ? [task.assignee] : [];
                return (
                  <article key={task.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm border-2 border-blue-500" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{task.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
                        <span className="font-mono">{task.taskCode}</span>
                        <span>{STATUS_META[task.status].label}</span>
                        <span className="inline-flex items-center gap-1"><Flag size={10} />{PRIORITY_META[task.priority].label}</span>
                        {assignees.length > 0 && (
                          <span className="inline-flex min-w-0 items-center gap-1.5" title={assignees.join(', ')}>
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700">
                              {assignees[0].charAt(0).toUpperCase()}
                            </span>
                            <span className="truncate">{assignees.length > 1 ? `${assignees[0]} +${assignees.length - 1}` : assignees[0]}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <button disabled={!selectedSprint} onClick={() => void assignTask(task.id, selectedSprint)} className="shrink-0 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-40">Thêm</button>
                  </article>
                );
              })}
            </div>
            <h3 className="pt-3 text-sm font-bold text-slate-700">Task trong Sprint</h3>
            <div className="searchable-select-scrollbar max-h-[40vh] space-y-2 overflow-y-auto pr-1">
            {sprintTasks.map((task) => (
              <article key={task.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{task.title}</p>
                  <p className="text-xs text-slate-400">{task.taskCode} · {task.status}</p>
                </div>
                <button onClick={() => void moveToBacklog(task)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Backlog</button>
              </article>
            ))}
            {sprintTasks.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-400">Không có task đang mở trong Sprint.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
