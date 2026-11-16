import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { STATUS_META, TASK_STATUSES } from '../types';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Loader2,
  MessageSquare,
  Search,
  Send,
  ShieldAlert,
  UsersRound,
  X,
} from 'lucide-react';

type EmployeeFilter = 'all' | 'completed' | 'pending' | 'blockers';

interface EmployeeSummary {
  userId: number;
  name: string;
  employeeCode: string;
  jobTitle: string;
  department: string | null;
  isComplete: boolean;
  hasCheckin: boolean;
  blockerStatus: 'NONE' | 'BLOCKED' | null;
  blockerImpact: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  reviewedTaskCount: number;
  plannedTaskCount: number;
  completedAt: string | null;
  savedAt: string | null;
}

interface CheckinStats {
  date: string;
  totalEmployees: number;
  completedCheckins: number;
  pendingCheckins: number;
  completionRate: number;
  blockerCount: number;
  reviewedTasks: number;
  employees: EmployeeSummary[];
}

interface ReportTask {
  id: number;
  taskCode: string;
  title: string;
  status: string;
  projectName: string | null;
}

interface EmployeeDetail {
  user: Pick<EmployeeSummary, 'userId' | 'name' | 'employeeCode' | 'jobTitle' | 'department'>;
  date: string;
  checkin: {
    isComplete: boolean;
    reviewConfirmed: boolean;
    planConfirmed: boolean;
    completedAt: string | null;
    savedAt: string | null;
    blockerStatus: 'NONE' | 'BLOCKED' | null;
    blockerDescription: string | null;
    blockerImpact: 'LOW' | 'MEDIUM' | 'HIGH' | null;
    blockerTaskId: number | null;
    blockerFeedback: string | null;
    blockerFeedbackBy: string | null;
    blockerFeedbackAt: string | null;
  } | null;
  reviewedTasks: ReportTask[];
  plannedTasks: ReportTask[];
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

function taskStatusLabel(status: string): string {
  const validStatus = TASK_STATUSES.find((candidate) => candidate === status);
  return validStatus ? STATUS_META[validStatus].label : status;
}

function getErrorMessage(error: unknown): string {
  return (error as { response?: { data?: { message?: string } } }).response?.data?.message
    ?? 'Không thể tải dữ liệu Daily Check-in.';
}

export default function AdminDailyCheckin() {
  const [date, setDate] = useState(localDate);
  const [stats, setStats] = useState<CheckinStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<EmployeeFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSummary | null>(null);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackNotice, setFeedbackNotice] = useState('');

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ data: CheckinStats }>('/v1/admin/daily-checkin/stats', {
        params: { date },
      });
      setStats(response.data.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void loadStats(); }, [loadStats]);

  const employees = useMemo(() => {
    const all = stats?.employees ?? [];
    const filtered = all.filter((employee) => {
      if (filter === 'completed' && !employee.isComplete) return false;
      if (filter === 'pending' && employee.isComplete) return false;
      if (filter === 'blockers' && (!employee.isComplete || employee.blockerStatus !== 'BLOCKED')) return false;
      const term = search.trim().toLocaleLowerCase();
      return !term || `${employee.name} ${employee.employeeCode} ${employee.department ?? ''}`
        .toLocaleLowerCase().includes(term);
    });
    return filtered;
  }, [filter, search, stats]);

  const openEmployee = async (employee: EmployeeSummary) => {
    setSelectedEmployee(employee);
    setDetail(null);
    setDetailError('');
    setFeedbackDraft('');
    setFeedbackError('');
    setFeedbackNotice('');
    setDetailLoading(true);
    try {
      const response = await api.get<{ data: EmployeeDetail }>(
        `/v1/admin/daily-checkin/${employee.userId}`,
        { params: { date } },
      );
      setDetail(response.data.data);
      setFeedbackDraft(response.data.data.checkin?.blockerFeedback ?? '');
    } catch (loadError) {
      setDetailError(getErrorMessage(loadError));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedEmployee(null);
    setDetail(null);
    setDetailError('');
    setFeedbackDraft('');
    setFeedbackError('');
    setFeedbackNotice('');
  };

  const saveFeedback = async () => {
    if (!selectedEmployee || !detail?.checkin) return;
    const feedback = feedbackDraft.trim();
    if (feedback.length > 2000) {
      setFeedbackError('Phản hồi không được vượt quá 2000 ký tự.');
      return;
    }
    setFeedbackSaving(true);
    setFeedbackError('');
    setFeedbackNotice('');
    try {
      const response = await api.patch<{
        data: {
          blockerFeedback: string | null;
          blockerFeedbackBy: string | null;
          blockerFeedbackAt: string | null;
        };
      }>(`/v1/admin/daily-checkin/${selectedEmployee.userId}/feedback`, {
        feedback,
      }, { params: { date } });
      setDetail((current) => current?.checkin
        ? { ...current, checkin: { ...current.checkin, ...response.data.data } }
        : current);
      setFeedbackDraft(response.data.data.blockerFeedback ?? '');
      setFeedbackNotice(feedback ? 'Đã lưu phản hồi. Nhân sự có thể xem nội dung này.' : 'Đã xóa phản hồi.');
    } catch (saveError) {
      setFeedbackError(getErrorMessage(saveError));
    } finally {
      setFeedbackSaving(false);
    }
  };

  const cards = [
    {
      label: 'Nhân sự đã cập nhật',
      value: `${stats?.completedCheckins ?? 0}/${stats?.totalEmployees ?? 0}`,
      detail: `${stats?.completionRate ?? 0}% hoàn thành`,
      icon: <CheckCircle2 size={20} />,
      color: 'text-emerald-700 bg-emerald-50',
      filter: 'completed' as const,
    },
    {
      label: 'Nhân sự chưa cập nhật',
      value: String(stats?.pendingCheckins ?? 0),
      detail: 'Cần hoàn tất Daily Check-in',
      icon: <UsersRound size={20} />,
      color: 'text-amber-700 bg-amber-50',
      filter: 'pending' as const,
    },
    {
      label: 'Vướng mắc cần xử lý',
      value: String(stats?.blockerCount ?? 0),
      detail: 'Nhân sự cần hỗ trợ',
      icon: <ShieldAlert size={20} />,
      color: 'text-rose-700 bg-rose-50',
      filter: 'blockers' as const,
    },
    {
      label: 'Task đã rà soát',
      value: String(stats?.reviewedTasks ?? 0),
      detail: 'Tổng lượt rà soát trong ngày',
      icon: <ClipboardList size={20} />,
      color: 'text-blue-700 bg-blue-50',
      filter: 'all' as const,
    },
  ];

  return (
    <section className="space-y-4 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/70 p-4 shadow-sm sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
              <UsersRound size={18} />
            </span>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Tổng quan Daily Check-in</h2>
              <p className="text-xs text-slate-500">Tiến độ cập nhật và nhu cầu hỗ trợ của đội ngũ</p>
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 sm:self-auto">
          <CalendarDays size={15} className="text-indigo-600" />
          <span>Ngày</span>
          <input
            type="date"
            aria-label="Ngày thống kê Daily Check-in"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              closeDetail();
            }}
            className="min-w-0 bg-transparent text-xs font-bold text-slate-800 outline-none"
          />
        </label>
      </header>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={() => void loadStats()} className="font-bold underline">Thử lại</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <button
                key={card.label}
                type="button"
                onClick={() => setFilter(card.filter)}
                aria-pressed={filter === card.filter}
                className={`group rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                  filter === card.filter ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200/80'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{card.label}</p>
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${card.color}`}>{card.icon}</span>
                </div>
                <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                  {loading ? <span className="inline-block h-9 w-14 animate-pulse rounded bg-slate-100" /> : card.value}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{loading ? 'Đang tải…' : card.detail}</p>
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Danh sách nhân sự</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {loading ? 'Đang đồng bộ dữ liệu…' : `${employees.length} nhân sự · Chọn một người để xem nội dung cập nhật`}
                </p>
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm tên, mã nhân sự..."
                  aria-label="Tìm nhân sự"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-9 text-sm text-slate-500">
                <Loader2 size={17} className="animate-spin" /> Đang tải thống kê…
              </div>
            ) : employees.length === 0 ? (
              <p className="px-4 py-9 text-center text-sm text-slate-500">Không có nhân sự phù hợp với bộ lọc.</p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto overscroll-contain">
                {employees.map((employee) => (
                  <li key={employee.userId}>
                    <button
                      type="button"
                      onClick={() => void openEmployee(employee)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-indigo-50/50 focus:bg-indigo-50/70 focus:outline-none"
                    >
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-extrabold ${
                        employee.isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {employee.name.trim().split(/\s+/).slice(-1)[0]?.slice(0, 1).toLocaleUpperCase() ?? '?'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900">{employee.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {employee.employeeCode} · {employee.jobTitle}{employee.department ? ` · ${employee.department}` : ''}
                        </span>
                      </span>
                      <span className="hidden text-right text-xs text-slate-500 sm:block">
                        {employee.isComplete ? `${employee.reviewedTaskCount} task rà soát · ${employee.plannedTaskCount} ưu tiên` : 'Chưa hoàn tất'}
                      </span>
                      {employee.blockerStatus === 'BLOCKED' && employee.isComplete && (
                        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold text-rose-700">Cần hỗ trợ</span>
                      )}
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                        employee.isComplete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                      }`}>
                        {employee.isComplete ? 'Đã cập nhật' : employee.hasCheckin ? 'Bản nháp' : 'Chưa cập nhật'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {selectedEmployee && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/40 backdrop-blur-[2px]" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDetail();
        }}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkin-detail-title"
            className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl animate-in slide-in-from-right duration-200"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-bold text-indigo-600">{selectedEmployee.employeeCode} · {date}</p>
                <h2 id="checkin-detail-title" className="mt-1 truncate text-xl font-extrabold text-slate-900">{selectedEmployee.name}</h2>
                <p className="mt-1 text-xs text-slate-500">{selectedEmployee.jobTitle}{selectedEmployee.department ? ` · ${selectedEmployee.department}` : ''}</p>
              </div>
              <button type="button" onClick={closeDetail} aria-label="Đóng chi tiết nhân sự" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
                <X size={18} />
              </button>
            </header>
            <div className="space-y-5 p-5 sm:p-6">
              {detailLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                  <Loader2 size={18} className="animate-spin" /> Đang tải nội dung cập nhật…
                </div>
              ) : detailError ? (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <div className="flex items-center gap-2 font-bold"><AlertCircle size={16} /> Không tải được chi tiết</div>
                  <p className="mt-1">{detailError}</p>
                </div>
              ) : detail ? (
                <>
                  {!detail.checkin ? (
                    <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 p-5 text-center">
                      <Clock3 size={24} className="mx-auto text-amber-600" />
                      <p className="mt-2 text-sm font-extrabold text-slate-900">Chưa gửi Daily Check-in</p>
                      <p className="mt-1 text-xs text-slate-600">Chưa có nội dung cập nhật nào trong ngày này.</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                        <span className="text-xs font-bold text-slate-600">Trạng thái cập nhật</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
                          detail.checkin.isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {detail.checkin.isComplete ? 'Đã hoàn tất' : 'Bản nháp'}
                        </span>
                      </div>
                      <section>
                        <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                          <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-700"><ClipboardList size={15} /></span>
                          Hôm qua đã làm gì?
                        </h3>
                        <p className="mb-2 mt-1 pl-9 text-xs text-slate-500">Các task được rà soát trong Daily Check-in</p>
                        <TaskList tasks={detail.reviewedTasks} empty="Chưa ghi nhận task đã rà soát." />
                      </section>
                      <section>
                        <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                          <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-indigo-700"><CheckCircle2 size={15} /></span>
                          Kế hoạch hôm nay
                        </h3>
                        <p className="mb-2 mt-1 pl-9 text-xs text-slate-500">Các task ưu tiên đã chọn</p>
                        <TaskList tasks={detail.plannedTasks} empty="Chưa chọn task ưu tiên." />
                      </section>
                      <section>
                        <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                          <span className={`grid h-7 w-7 place-items-center rounded-lg ${
                            detail.checkin.blockerStatus === 'BLOCKED' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                          }`}><ShieldAlert size={15} /></span>
                          Khó khăn, vướng mắc
                        </h3>
                        <div className={`mt-2 rounded-xl p-4 ${
                          detail.checkin.blockerStatus === 'BLOCKED' ? 'bg-rose-50 text-rose-900' : 'bg-emerald-50 text-emerald-900'
                        }`}>
                          <p className="text-sm font-bold">{detail.checkin.blockerStatus === 'BLOCKED' ? 'Cần hỗ trợ' : 'Không có vướng mắc'}</p>
                          {detail.checkin.blockerStatus === 'BLOCKED' && (
                            <>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{detail.checkin.blockerDescription}</p>
                              {detail.checkin.blockerImpact && (
                                <p className="mt-2 text-xs font-bold">Mức ảnh hưởng: {{
                                  LOW: 'Thấp',
                                  MEDIUM: 'Trung bình',
                                  HIGH: 'Cao',
                                }[detail.checkin.blockerImpact]}</p>
                              )}
                            </>
                          )}
                        </div>
                      </section>
                      {detail.checkin.isComplete && detail.checkin.blockerStatus === 'BLOCKED' && (
                        <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                          <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                            <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-blue-700"><MessageSquare size={15} /></span>
                            Phản hồi quản lý
                          </h3>
                          {detail.checkin.blockerFeedback && (
                            <div className="mt-3 rounded-xl border border-blue-100 bg-white p-3">
                              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{detail.checkin.blockerFeedback}</p>
                              <p className="mt-2 text-[10px] text-slate-400">
                                {detail.checkin.blockerFeedbackBy ?? 'Quản lý'} · {formatDateTime(detail.checkin.blockerFeedbackAt)}
                              </p>
                            </div>
                          )}
                          <label className="mt-3 block text-xs font-bold text-slate-600">
                            {detail.checkin.blockerFeedback ? 'Cập nhật phản hồi' : 'Viết phản hồi'}
                            <textarea
                              value={feedbackDraft}
                              onChange={(event) => {
                                setFeedbackDraft(event.target.value);
                                setFeedbackError('');
                                setFeedbackNotice('');
                              }}
                              maxLength={2000}
                              rows={4}
                              placeholder="Ghi rõ hướng xử lý hoặc hỗ trợ dành cho nhân sự..."
                              className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal leading-6 text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </label>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] text-slate-400">{feedbackDraft.length}/2000 ký tự</span>
                            <button
                              type="button"
                              onClick={() => void saveFeedback()}
                              disabled={feedbackSaving || feedbackDraft.trim() === (detail.checkin.blockerFeedback ?? '')}
                              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {feedbackSaving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                              {feedbackSaving ? 'Đang lưu…' : feedbackDraft.trim() ? 'Gửi phản hồi' : 'Xóa phản hồi'}
                            </button>
                          </div>
                          {feedbackError && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{feedbackError}</p>}
                          {feedbackNotice && <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">{feedbackNotice}</p>}
                        </section>
                      )}
                      <p className="border-t border-slate-100 pt-4 text-xs text-slate-400">
                        {detail.checkin.isComplete ? 'Hoàn tất lúc' : 'Cập nhật gần nhất'}: {formatDateTime(
                          detail.checkin.completedAt ?? detail.checkin.savedAt,
                        )}
                      </p>
                    </>
                  )}
                </>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function TaskList({ tasks, empty }: { tasks: ReportTask[]; empty: string }) {
  if (tasks.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-500">{empty}</p>;
  }
  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold text-indigo-700">{task.taskCode}</p>
            <p className="mt-0.5 text-sm font-semibold leading-5 text-slate-800">{task.title}</p>
            {task.projectName && <p className="mt-1 text-[11px] text-slate-500">{task.projectName}</p>}
          </div>
          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{taskStatusLabel(task.status)}</span>
        </li>
      ))}
    </ul>
  );
}
