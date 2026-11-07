import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AssigneeStat, AssignableUser, Project } from '../types';
import SearchableSelect from '../components/common/SearchableSelect';

export default function Reports() {
  const [stats, setStats] = useState<AssigneeStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprints, setSprints] = useState<Array<{ id: number; name: string }>>([]);
  const [members, setMembers] = useState<AssignableUser[]>([]);
  const [projectId, setProjectId] = useState('');
  const [sprintId, setSprintId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get<{ data: Project[] }>('/projects')
      .then((response) => setProjects(response.data.data ?? []))
      .catch(() => setError('Không tải được danh sách dự án'));
  }, []);

  useEffect(() => {
    setSprintId('');
    setAssigneeId('');
    setSprints([]);
    setMembers([]);
    if (!projectId) return;
    Promise.all([
      api.get<{ data: Array<{ id: number; name: string }> }>(`/projects/${projectId}/sprints`),
      api.get<{ data: AssignableUser[] }>(`/projects/${projectId}/members/options`),
    ])
      .then(([sprintResponse, memberResponse]) => {
        setSprints(sprintResponse.data.data);
        setMembers(memberResponse.data.data);
      })
      .catch(() => setError('Không tải được sprint hoặc thành viên dự án'));
  }, [projectId]);

  useEffect(() => {
    api
      .get('/tasks/stats/by-assignee')
      .then((res) => setStats(res.data.data))
      .catch((err) => {
        const message =
          (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          'Không tải được báo cáo';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500">Đang tải…</p>;
  if (error) return <p className="text-rose-600">{error}</p>;

  const totals = stats.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      done: acc.done + s.golive,
      overdue: acc.overdue + s.overdue,
    }),
    { total: 0, done: 0, overdue: 0 },
  );
  const overallRate = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;
  const totalEstimatedHours = stats.reduce((sum, item) => sum + item.estimatedHours, 0);
  const totalLoggedHours = stats.reduce((sum, item) => sum + item.loggedHours, 0);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const response = await api.get('/tasks/export', {
        params: {
          ...(projectId ? { projectId } : {}),
          ...(sprintId ? { sprintId } : {}),
          ...(assigneeId ? { assigneeId } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'task-report.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Xuất báo cáo thất bại');
    } finally {
      setExporting(false);
    }
  };

  const summaryCards = [
    { label: 'Tổng công việc', value: totals.total, tone: 'text-slate-900' },
    { label: 'Đã Golive', value: stats.reduce((sum, item) => sum + item.golive, 0), tone: 'text-emerald-600' },
    { label: 'Trễ hạn', value: totals.overdue, tone: 'text-rose-600' },
    { label: 'Tỉ lệ hoàn thành', value: `${overallRate}%`, tone: 'text-blue-600' },
    { label: 'Estimated / Logged', value: `${totalEstimatedHours}h / ${totalLoggedHours}h`, tone: 'text-indigo-600' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Báo cáo theo nhân sự</h1>
      <p className="text-sm text-slate-500 mb-6">Thống kê số lượng công việc và tiến độ của từng người.</p>

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Dự án
          <SearchableSelect
            ariaLabel="Lọc báo cáo theo dự án"
            value={projectId}
            onChange={setProjectId}
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
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Sprint
          <SearchableSelect
            ariaLabel="Lọc báo cáo theo Sprint"
            value={sprintId}
            onChange={setSprintId}
            disabled={!projectId}
            placeholder="Tất cả sprint"
            options={[
              { value: '', label: 'Tất cả sprint' },
              ...sprints.map((sprint) => ({ value: String(sprint.id), label: sprint.name })),
            ]}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Nhân sự
          <SearchableSelect
            ariaLabel="Lọc báo cáo theo nhân sự"
            value={assigneeId}
            onChange={setAssigneeId}
            disabled={!projectId}
            placeholder="Tất cả thành viên"
            options={[
              { value: '', label: 'Tất cả thành viên' },
              ...members.map((member) => ({
                value: String(member.id),
                label: member.name,
                keywords: `${member.email} ${member.username ?? ''} ${member.employeeCode}`,
              })),
            ]}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Từ
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Đến
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2" />
        </label>
        <button onClick={() => void exportCsv()} disabled={exporting} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
          {exporting ? 'Đang xuất…' : 'Xuất CSV'}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">{card.label}</div>
            <div className={`mt-1 text-2xl font-bold ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-3 font-medium">Nhân sự</th>
              <th className="px-4 py-3 font-medium text-center">Tổng</th>
              <th className="px-4 py-3 font-medium text-center">To Do</th>
              <th className="px-4 py-3 font-medium text-center">In Progress</th>
              <th className="px-4 py-3 font-medium text-center">Dev Done</th>
              <th className="px-4 py-3 font-medium text-center">Testing</th>
              <th className="px-4 py-3 font-medium text-center">Test Fail</th>
              <th className="px-4 py-3 font-medium text-center">Done</th>
              <th className="px-4 py-3 font-medium text-center">Review</th>
              <th className="px-4 py-3 font-medium text-center">Golive</th>
              <th className="px-4 py-3 font-medium text-center">Estimated h</th>
              <th className="px-4 py-3 font-medium text-center">Logged h</th>
              <th className="px-4 py-3 font-medium text-center">Pending</th>
              <th className="px-4 py-3 font-medium text-center">Trễ hạn</th>
              <th className="px-4 py-3 font-medium">Hoàn thành</th>
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-8 text-center text-slate-400">
                  Chưa có dữ liệu
                </td>
              </tr>
            ) : (
              stats.map((s) => (
                <tr key={s.assignee} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{s.assignee}</td>
                  <td className="px-4 py-3 text-center">{s.total}</td>
                  <td className="px-4 py-3 text-center text-slate-500">{s.todo}</td>
                  <td className="px-4 py-3 text-center text-blue-600">{s.inProgress}</td>
                  <td className="px-4 py-3 text-center text-violet-600">{s.devDone}</td>
                  <td className="px-4 py-3 text-center text-amber-600">{s.testing}</td>
                  <td className="px-4 py-3 text-center text-rose-600">{s.testFail}</td>
                  <td className="px-4 py-3 text-center text-emerald-600">{s.done}</td>
                  <td className="px-4 py-3 text-center text-amber-600">{s.review}</td>
                  <td className="px-4 py-3 text-center text-purple-700">{s.golive}</td>
                  <td className="px-4 py-3 text-center">{s.estimatedHours}</td>
                  <td className="px-4 py-3 text-center">{s.loggedHours}</td>
                  <td className="px-4 py-3 text-center text-rose-500">{s.pending}</td>
                  <td className="px-4 py-3 text-center">
                    {s.overdue > 0 ? (
                      <span className="font-medium text-rose-600">{s.overdue}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${s.completionRate}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{s.completionRate}%</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
