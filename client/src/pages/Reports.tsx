import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AssigneeStat, AssignableUser, Project } from '../types';
import SearchableSelect from '../components/common/SearchableSelect';
import { useAuth } from '../context/AuthContext';
import { FileSpreadsheet, Printer, RefreshCw } from 'lucide-react';

type ReportPeriod = 'week' | 'month' | 'custom';

interface PeriodReport {
  period: ReportPeriod;
  startDate: string;
  endDate: string;
  scope: 'company' | 'department';
  department: string | null;
  summary: {
    assigned: number;
    completed: number;
    overdue: number;
    inProgress: number;
    taskCount: number;
  };
  byDepartment: Array<{
    department: string;
    assigned: number;
    completed: number;
    overdue: number;
  }>;
  byEmployee: Array<{
    userId: number;
    name: string;
    department: string;
    assigned: number;
    completed: number;
    overdue: number;
  }>;
  tasks: Array<{
    id: number;
    taskCode: string;
    title: string;
    assignees: string;
    departments: string;
    status: string;
    priority: string;
    startDate: string | null;
    dueDate: string | null;
    createdAt: string;
    completedAt: string | null;
    assignedInPeriod: boolean;
    completedInPeriod: boolean;
    currentlyOverdue: boolean;
    overdueInPeriod: boolean;
  }>;
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentWeekRange(reference = new Date()) {
  const start = new Date(Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function reportDate(value: string | null): string {
  if (!value) return '-';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Reports() {
  const { user } = useAuth();
  const canViewPeriodReport = user?.role === 'admin' || user?.isAccAdmin === true || user?.jobTitle === 'Project Lead';
  const [stats, setStats] = useState<AssigneeStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const today = localDateString(new Date());
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [weekReference, setWeekReference] = useState(today);
  const [monthReference, setMonthReference] = useState(today.slice(0, 7));
  const initialWeek = currentWeekRange();
  const [customStart, setCustomStart] = useState(initialWeek.startDate);
  const [customEnd, setCustomEnd] = useState(today);
  const [periodReport, setPeriodReport] = useState<PeriodReport | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState('');
  const [exportingPeriod, setExportingPeriod] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprints, setSprints] = useState<Array<{ id: number; name: string }>>([]);
  const [members, setMembers] = useState<AssignableUser[]>([]);
  const [projectId, setProjectId] = useState('');
  const [sprintId, setSprintId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const getPeriodParams = useCallback(() => {
    if (period === 'week') {
      return { period, ...currentWeekRange(new Date(`${weekReference}T00:00:00`)) };
    }
    if (period === 'month') {
      const [year, monthNumber] = monthReference.split('-').map(Number);
      const start = new Date(year, monthNumber - 1, 1);
      const end = new Date(year, monthNumber, 0);
      return { period, startDate: localDateString(start), endDate: localDateString(end) };
    }
    return { period, startDate: customStart, endDate: customEnd };
  }, [customEnd, customStart, monthReference, period, weekReference]);

  const loadPeriodReport = useCallback(async () => {
    setPeriodLoading(true);
    setPeriodError('');
    try {
      const response = await api.get<{ data: PeriodReport }>('/tasks/report/time', {
        params: getPeriodParams(),
      });
      setPeriodReport(response.data.data);
    } catch (reason) {
      const message = (reason as { response?: { data?: { message?: string } } }).response?.data?.message
        ?? 'Không tải được báo cáo theo kỳ.';
      setPeriodError(message);
      setPeriodReport(null);
    } finally {
      setPeriodLoading(false);
    }
  }, [getPeriodParams]);

  useEffect(() => {
    if (!canViewPeriodReport) return;
    let cancelled = false;
    const range = currentWeekRange();
    setPeriodLoading(true);
    api.get<{ data: PeriodReport }>('/tasks/report/time', {
      params: { period: 'week', ...range },
    })
      .then((response) => {
        if (!cancelled) setPeriodReport(response.data.data);
      })
      .catch((reason) => {
        if (cancelled) return;
        const message = (reason as { response?: { data?: { message?: string } } }).response?.data?.message
          ?? 'Không tải được báo cáo theo kỳ.';
        setPeriodError(message);
      })
      .finally(() => {
        if (!cancelled) setPeriodLoading(false);
      });
    return () => { cancelled = true; };
  }, [canViewPeriodReport]);

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
  const requestedPeriod = getPeriodParams();
  const reportMatchesFilters = Boolean(periodReport &&
    periodReport.period === requestedPeriod.period &&
    periodReport.startDate === requestedPeriod.startDate &&
    periodReport.endDate === requestedPeriod.endDate);

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

  const exportPeriodExcel = async () => {
    setExportingPeriod(true);
    setPeriodError('');
    try {
      const response = await api.get('/tasks/report/time/export', {
        params: { ...getPeriodParams(), format: 'xlsx' },
        responseType: 'blob',
      });
      downloadBlob(response.data, `tomo-task-report-${periodReport?.startDate ?? 'period'}.xlsx`);
    } catch (reason) {
      const message = (reason as { response?: { data?: { message?: string } } }).response?.data?.message
        ?? 'Không xuất được file Excel.';
      setPeriodError(message);
    } finally {
      setExportingPeriod(false);
    }
  };

  const printPeriodReport = () => {
    setPrinting(true);
    window.setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 0);
  };

  const summaryCards = [
    { label: 'Tổng công việc', value: totals.total, tone: 'text-slate-900' },
    { label: 'Đã Golive', value: stats.reduce((sum, item) => sum + item.golive, 0), tone: 'text-emerald-600' },
    { label: 'Trễ hạn', value: totals.overdue, tone: 'text-rose-600' },
    { label: 'Tỉ lệ hoàn thành', value: `${overallRate}%`, tone: 'text-blue-600' },
    { label: 'Estimated / Logged', value: `${totalEstimatedHours}h / ${totalLoggedHours}h`, tone: 'text-indigo-600' },
  ];

  return (
    <div className="space-y-8">
      {canViewPeriodReport && (
        <section id="time-report-print" className="space-y-5">
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #time-report-print, #time-report-print * { visibility: visible !important; }
              #time-report-print { position: absolute; inset: 0; width: 100%; padding: 16px; }
              #time-report-print .no-print { display: none !important; }
              #time-report-print .print-table { overflow: visible !important; }
              #time-report-print table { font-size: 9px; }
              #time-report-print th, #time-report-print td { padding: 5px !important; }
              @page { size: landscape; margin: 12mm; }
            }
          `}</style>
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-600">Báo cáo hiệu suất</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Báo cáo theo thời gian</h1>
              <p className="mt-1 text-sm text-slate-500">
                {periodReport
                  ? `${reportDate(periodReport.startDate)} – ${reportDate(periodReport.endDate)}${periodReport.department ? ` · ${periodReport.department}` : ' · Toàn công ty'}`
                  : 'Chọn kỳ báo cáo để xem số liệu'}
              </p>
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadPeriodReport()}
                disabled={periodLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw size={14} className={periodLoading ? 'animate-spin' : ''} />
                {periodLoading ? 'Đang tải…' : 'Xem báo cáo'}
              </button>
              <button
                type="button"
                onClick={() => void exportPeriodExcel()}
                disabled={!reportMatchesFilters || exportingPeriod}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                <FileSpreadsheet size={14} /> {exportingPeriod ? 'Đang xuất…' : 'Xuất Excel'}
              </button>
              <button
                type="button"
                onClick={printPeriodReport}
                disabled={!reportMatchesFilters || printing}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                <Printer size={14} /> In / Lưu PDF
              </button>
            </div>
          </header>

          <div className="no-print flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="grid gap-1.5 text-xs font-bold text-slate-600">
              Kỳ báo cáo
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value as ReportPeriod)}
                className="min-w-44 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="week">Theo tuần</option>
                <option value="month">Theo tháng</option>
                <option value="custom">Tùy chọn khoảng ngày</option>
              </select>
            </label>
            {period === 'week' && (
              <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                Tuần chứa ngày
                <input
                  type="date"
                  value={weekReference}
                  onChange={(event) => setWeekReference(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                />
              </label>
            )}
            {period === 'month' && (
              <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                Tháng
                <input
                  type="month"
                  value={monthReference}
                  onChange={(event) => setMonthReference(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                />
              </label>
            )}
            {period === 'custom' && (
              <>
                <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                  Từ ngày
                  <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                  Đến ngày
                  <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                </label>
              </>
            )}
            <p className="text-xs text-slate-500">
              {period === 'week'
                ? `Tự tính từ Thứ Hai đến Chủ Nhật · ${(() => { const range = currentWeekRange(new Date(`${weekReference}T00:00:00`)); return `${reportDate(range.startDate)} – ${reportDate(range.endDate)}`; })()}`
                : period === 'month'
                  ? 'Tổng hợp từ ngày đầu đến ngày cuối tháng'
                  : 'Tối đa 366 ngày mỗi báo cáo'}
            </p>
          </div>

          {periodError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{periodError}</p>}
          {periodLoading && !periodReport ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Đang tổng hợp báo cáo…</div>
          ) : periodReport && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {[
                  { label: 'Task được giao', value: periodReport.summary.assigned, tone: 'text-blue-700', accent: 'border-blue-200' },
                  { label: 'Hoàn thành', value: periodReport.summary.completed, tone: 'text-emerald-700', accent: 'border-emerald-200' },
                  { label: 'Quá hạn', value: periodReport.summary.overdue, tone: 'text-rose-700', accent: 'border-rose-200' },
                  { label: 'Đang làm', value: periodReport.summary.inProgress, tone: 'text-indigo-700', accent: 'border-indigo-200' },
                  { label: 'Task trong báo cáo', value: periodReport.summary.taskCount, tone: 'text-slate-900', accent: 'border-slate-200' },
                ].map((item) => (
                  <article key={item.label} className={`rounded-2xl border ${item.accent} bg-white p-4 shadow-sm`}>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{item.label}</p>
                    <p className={`mt-2 text-4xl font-extrabold tracking-tight ${item.tone}`}>{item.value}</p>
                  </article>
                ))}
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="font-extrabold text-slate-900">Theo phòng ban</h2>
                  </div>
                  <div className="print-table overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                        <tr><th className="px-4 py-3">Phòng ban</th><th className="px-4 py-3 text-center">Giao</th><th className="px-4 py-3 text-center">Hoàn thành</th><th className="px-4 py-3 text-center">Quá hạn</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {periodReport.byDepartment.length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-7 text-center text-slate-400">Chưa có dữ liệu</td></tr>
                        ) : periodReport.byDepartment.map((item) => (
                          <tr key={item.department}>
                            <td className="px-4 py-3 font-semibold text-slate-800">{item.department}</td>
                            <td className="px-4 py-3 text-center">{item.assigned}</td>
                            <td className="px-4 py-3 text-center font-semibold text-emerald-700">{item.completed}</td>
                            <td className="px-4 py-3 text-center font-semibold text-rose-700">{item.overdue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="font-extrabold text-slate-900">Theo nhân sự</h2>
                  </div>
                  <div className="print-table overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                        <tr><th className="px-4 py-3">Nhân sự</th><th className="px-4 py-3">Phòng ban</th><th className="px-4 py-3 text-center">Giao</th><th className="px-4 py-3 text-center">Hoàn thành</th><th className="px-4 py-3 text-center">Quá hạn</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {periodReport.byEmployee.length === 0 ? (
                          <tr><td colSpan={5} className="px-4 py-7 text-center text-slate-400">Chưa có dữ liệu</td></tr>
                        ) : periodReport.byEmployee.map((item) => (
                          <tr key={item.userId}>
                            <td className="px-4 py-3 font-semibold text-slate-800">{item.name}</td>
                            <td className="px-4 py-3 text-slate-600">{item.department || '—'}</td>
                            <td className="px-4 py-3 text-center">{item.assigned}</td>
                            <td className="px-4 py-3 text-center font-semibold text-emerald-700">{item.completed}</td>
                            <td className="px-4 py-3 text-center font-semibold text-rose-700">{item.overdue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="font-extrabold text-slate-900">Chi tiết công việc <span className="ml-1 text-sm font-semibold text-slate-400">({periodReport.tasks.length})</span></h2>
                </div>
                <div className="print-table overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr><th className="px-4 py-3">Mã Task</th><th className="px-4 py-3">Tên Task</th><th className="px-4 py-3">Người thực hiện</th><th className="px-4 py-3">Phòng ban</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Bắt đầu</th><th className="px-4 py-3">Kết thúc</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {periodReport.tasks.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Không có công việc trong kỳ này</td></tr>
                      ) : periodReport.tasks.map((task) => (
                        <tr key={task.id}>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-slate-600">{task.taskCode}</td>
                          <td className="min-w-56 px-4 py-3 font-semibold text-slate-800">{task.title}</td>
                          <td className="px-4 py-3 text-slate-600">{task.assignees || 'Chưa giao'}</td>
                          <td className="px-4 py-3 text-slate-600">{task.departments || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{task.status}</span></td>
                          <td className="whitespace-nowrap px-4 py-3">{reportDate(task.startDate)}</td>
                          <td className={`whitespace-nowrap px-4 py-3 ${task.overdueInPeriod ? 'font-bold text-rose-700' : ''}`}>{reportDate(task.dueDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <p className="text-xs text-slate-500">
                Task được giao = có người phụ trách và ngày tạo trong kỳ. Hoàn thành = ngày hoàn thành trong kỳ. Quá hạn = hạn trong kỳ, đã quá ngày hạn và hiện chưa hoàn thành.
              </p>
            </>
          )}
        </section>
      )}

      <section className="space-y-5">
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
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
                  {loading ? 'Đang tải dữ liệu…' : error ? 'Không thể tải dữ liệu báo cáo' : 'Chưa có dữ liệu'}
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
      </section>
    </div>
  );
}
