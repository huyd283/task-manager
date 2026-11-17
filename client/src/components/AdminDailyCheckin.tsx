import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { STATUS_META, TASK_STATUSES } from '../types';
import {
  ArrowRight,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Filter,
  Loader2,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  ShieldAlert,
  UsersRound,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Project } from '../types';

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

type BlockerStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
type BlockerPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type BlockerCategory = 'TECHNICAL' | 'DEPENDENCY' | 'RESOURCE' | 'ACCESS' | 'OTHER';

interface ManagedBlocker {
  id: number;
  checkinId: number;
  userId: number;
  reporterName: string;
  employeeCode: string;
  department: string | null;
  checkinDate: string;
  description: string;
  impact: string | null;
  taskId: number | null;
  taskCode: string | null;
  taskTitle: string | null;
  taskStatus: string | null;
  projectId: number | null;
  projectName: string | null;
  status: BlockerStatus;
  priority: BlockerPriority;
  category: BlockerCategory;
  assigneeId: number | null;
  assigneeName: string | null;
  version: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  comments: Array<{ id: number; body: string; userId: number | null; userName: string | null; createdAt: string }>;
  history: Array<{ id: number; actionType: string; oldValue: string | null; newValue: string | null; userName: string | null; createdAt: string }>;
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
    blockerId: number | null;
    blockerComments: Array<{ id: number; body: string; userName: string | null; createdAt: string }>;
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.isAccAdmin === true;
  const [date, setDate] = useState(localDate);
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<CheckinStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSummary | null>(null);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [blockers, setBlockers] = useState<ManagedBlocker[]>([]);
  const [blockerStatus, setBlockerStatus] = useState<'ACTIVE' | 'ALL' | BlockerStatus>('ACTIVE');
  const [selectedBlocker, setSelectedBlocker] = useState<ManagedBlocker | null>(null);
  const [blockerLoading, setBlockerLoading] = useState(false);
  const [blockerSaving, setBlockerSaving] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [remindingUserId, setRemindingUserId] = useState<number | null>(null);
  const [reminderStatus, setReminderStatus] = useState<Record<number, string>>({});

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ data: CheckinStats }>('/v1/admin/daily-checkin/stats', {
        params: { date, ...(projectId ? { projectId } : {}) },
      });
      setStats(response.data.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [date, projectId]);

  const loadBlockers = useCallback(async () => {
    try {
      const response = await api.get<{ data: ManagedBlocker[] }>('/v1/admin/daily-checkin/blockers', {
        params: {
          status: blockerStatus,
          ...(projectId ? { projectId } : {}),
        },
      });
      setBlockers(response.data.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, [blockerStatus, projectId]);

  useEffect(() => {
    api.get<{ data: Project[] }>('/projects')
      .then((response) => setProjects(response.data.data))
      .catch((loadError) => setError(getErrorMessage(loadError)));
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats]);
  useEffect(() => { void loadBlockers(); }, [loadBlockers]);

  const visibleProjects = useMemo(() => isAdmin
    ? projects
    : projects.filter((project) => project.members.some((member) =>
      member.id === user?.id && member.role_in_project !== 'lead',
    )), [isAdmin, projects, user?.id]);

  const employees = useMemo(() => {
    const all = stats?.employees ?? [];
    return all.filter((employee) => {
      const term = search.trim().toLocaleLowerCase();
      return !term || `${employee.name} ${employee.employeeCode} ${employee.department ?? ''}`
        .toLocaleLowerCase().includes(term);
    });
  }, [search, stats]);

  const completedEmployees = employees.filter((employee) => employee.isComplete);
  const pendingEmployees = employees.filter((employee) => !employee.isComplete);
  const filteredBlockers = blockers.filter((blocker) => {
    const term = search.trim().toLocaleLowerCase();
    return !term || `${blocker.reporterName} ${blocker.employeeCode} ${blocker.description} ${blocker.taskCode ?? ''} ${blocker.taskTitle ?? ''} ${blocker.projectName ?? ''}`
      .toLocaleLowerCase().includes(term);
  });

  const openEmployee = async (employee: EmployeeSummary) => {
    setSelectedEmployee(employee);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const response = await api.get<{ data: EmployeeDetail }>(
        `/v1/admin/daily-checkin/${employee.userId}`,
        { params: { date, ...(projectId ? { projectId } : {}) } },
      );
      setDetail(response.data.data);
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
  };

  const openBlockerById = async (blockerId: number) => {
    setSelectedBlocker(null);
    setBlockerLoading(true);
    setCommentDraft('');
    try {
      const response = await api.get<{ data: ManagedBlocker }>(
        `/v1/admin/daily-checkin/blockers/${blockerId}`,
      );
      setSelectedBlocker(response.data.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setSelectedBlocker(null);
    } finally {
      setBlockerLoading(false);
    }
  };

  const openBlocker = (blocker: ManagedBlocker) => openBlockerById(blocker.id);

  const updateSelectedBlocker = async (patch: Partial<Pick<ManagedBlocker, 'status' | 'priority' | 'category' | 'assigneeId'>>) => {
    if (!selectedBlocker) return;
    setBlockerSaving(true);
    try {
      const response = await api.patch<{ data: ManagedBlocker }>(
        `/v1/admin/daily-checkin/blockers/${selectedBlocker.id}`,
        { ...patch, version: selectedBlocker.version },
      );
      setSelectedBlocker(response.data.data);
      await Promise.all([loadBlockers(), loadStats()]);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBlockerSaving(false);
    }
  };

  const addBlockerComment = async () => {
    if (!selectedBlocker || !commentDraft.trim()) return;
    setBlockerSaving(true);
    try {
      const response = await api.post<{ data: ManagedBlocker }>(
        `/v1/admin/daily-checkin/blockers/${selectedBlocker.id}/comments`,
        { body: commentDraft.trim() },
      );
      setSelectedBlocker(response.data.data);
      setCommentDraft('');
      await loadBlockers();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBlockerSaving(false);
    }
  };

  const remindEmployee = async (employee: EmployeeSummary) => {
    setRemindingUserId(employee.userId);
    setReminderStatus((current) => ({ ...current, [employee.userId]: '' }));
    try {
      const response = await api.post<{ data: { status: 'SUBMITTED' | 'ALREADY_SENT' } }>(
        '/v1/admin/daily-checkin/reminders',
        { userId: employee.userId, date, ...(projectId ? { projectId: Number(projectId) } : {}) },
      );
      setReminderStatus((current) => ({
        ...current,
        [employee.userId]: response.data.data.status === 'ALREADY_SENT'
          ? 'Đã nhắc hôm nay'
          : 'Đã gửi yêu cầu nhắc',
      }));
    } catch (reminderError) {
      setReminderStatus((current) => ({ ...current, [employee.userId]: getErrorMessage(reminderError) }));
    } finally {
      setRemindingUserId(null);
    }
  };

  const cards = [
    {
      label: 'Nhân sự đã cập nhật',
      value: `${stats?.completedCheckins ?? 0}/${stats?.totalEmployees ?? 0}`,
      detail: `${stats?.completionRate ?? 0}% hoàn thành`,
      icon: <CheckCircle2 size={20} />,
      color: 'text-emerald-700 bg-emerald-50',
      target: 'admin-completed',
    },
    {
      label: 'Nhân sự chưa cập nhật',
      value: String(stats?.pendingCheckins ?? 0),
      detail: 'Cần hoàn tất Daily Check-in',
      icon: <UsersRound size={20} />,
      color: 'text-amber-700 bg-amber-50',
      target: 'admin-pending',
    },
    {
      label: 'Vướng mắc cần xử lý',
      value: String(stats?.blockerCount ?? blockers.filter((blocker) => blocker.status !== 'RESOLVED').length),
      detail: 'Vướng mắc đang mở',
      icon: <ShieldAlert size={20} />,
      color: 'text-rose-700 bg-rose-50',
      target: 'admin-blockers',
    },
    {
      label: 'Tỉ lệ cập nhật',
      value: `${stats?.completionRate ?? 0}%`,
      detail: `${stats?.completedCheckins ?? 0}/${stats?.totalEmployees ?? 0} nhân sự đã hoàn tất`,
      icon: <ClipboardList size={20} />,
      color: 'text-blue-700 bg-blue-50',
      target: 'admin-completed',
    },
  ];

  return (
    <section className="space-y-4 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/70 p-4 shadow-sm sm:p-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
            <UsersRound size={20} />
          </span>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Daily Check-in · Quản lý</h2>
            <p className="text-sm text-slate-500">Theo dõi tiến độ, gỡ vướng mắc và hỗ trợ đội ngũ</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-600">
            <CalendarDays size={16} className="text-indigo-600" />
            <span className="sr-only">Ngày báo cáo</span>
            <input
              type="date"
              aria-label="Ngày thống kê Daily Check-in"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                closeDetail();
              }}
              className="min-w-0 bg-transparent text-sm font-bold text-slate-800 outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-600">
            <Filter size={15} className="text-indigo-600" />
            <span className="sr-only">Phạm vi dự án</span>
            <select
              aria-label="Phạm vi dự án Daily Check-in"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                closeDetail();
                setSelectedBlocker(null);
              }}
              className="max-w-56 bg-transparent text-sm font-bold text-slate-800 outline-none"
            >
              <option value="">Toàn bộ dự án</option>
              {visibleProjects.map((project) => (
                <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void Promise.all([loadStats(), loadBlockers()])}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <ShieldCheck size={16} className="text-emerald-600" /> Làm mới
          </button>
        </div>
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
                onClick={() => document.getElementById(card.target)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className="group rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
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

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Danh sách nhân sự &amp; vướng mắc</h3>
              <p className="mt-0.5 text-xs text-slate-500">{loading ? 'Đang đồng bộ…' : `${employees.length} nhân sự trong phạm vi · chọn để xem chi tiết`}</p>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm nhân sự, task, dự án hoặc vướng mắc..."
                aria-label="Tìm trong danh sách Daily Check-in"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <section id="admin-completed" className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
              <header className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/70 px-4 py-3">
                <div>
                  <h3 className="text-sm font-extrabold text-emerald-900">Đã cập nhật</h3>
                  <p className="text-xs text-emerald-700">Báo cáo hoàn tất trong ngày</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-sm font-black text-emerald-800">{completedEmployees.length}</span>
              </header>
              {loading ? <LaneLoading /> : completedEmployees.length === 0 ? <LaneEmpty label="Chưa có báo cáo hoàn tất." /> : (
                <ul className="searchable-select-scrollbar max-h-[440px] divide-y divide-slate-100 overflow-y-auto overscroll-contain">
                  {completedEmployees.map((employee) => (
                    <li key={employee.userId}>
                      <button type="button" onClick={() => void openEmployee(employee)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-emerald-50/50">
                        <Avatar name={employee.name} complete />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-slate-900">{employee.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{employee.employeeCode} · {employee.reviewedTaskCount} rà soát · {employee.plannedTaskCount} ưu tiên</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">Hoàn tất</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section id="admin-pending" className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
              <header className="flex items-center justify-between border-b border-amber-100 bg-amber-50/70 px-4 py-3">
                <div>
                  <h3 className="text-sm font-extrabold text-amber-950">Chưa cập nhật</h3>
                  <p className="text-xs text-amber-800">Có thể gửi nhắc nhanh</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-sm font-black text-amber-900">{pendingEmployees.length}</span>
              </header>
              {loading ? <LaneLoading /> : pendingEmployees.length === 0 ? <LaneEmpty label="Tất cả nhân sự đã cập nhật." /> : (
                <ul className="searchable-select-scrollbar max-h-[440px] divide-y divide-slate-100 overflow-y-auto overscroll-contain">
                  {pendingEmployees.map((employee) => (
                    <li key={employee.userId} className="flex items-center gap-2 px-3 py-3 transition hover:bg-amber-50/40">
                      <button type="button" onClick={() => void openEmployee(employee)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <Avatar name={employee.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-slate-900">{employee.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{employee.employeeCode} · {employee.jobTitle}</span>
                        </span>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => void remindEmployee(employee)}
                          disabled={remindingUserId === employee.userId || date !== localDate()}
                          title={date !== localDate() ? 'Chỉ có thể nhắc cho ngày hiện tại' : undefined}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-extrabold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {remindingUserId === employee.userId ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                          Nhắc
                        </button>
                        {reminderStatus[employee.userId] && (
                          <span className={`max-w-28 text-right text-[9px] leading-3 ${reminderStatus[employee.userId].startsWith('Đã') ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {reminderStatus[employee.userId]}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section id="admin-blockers" className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100 bg-rose-50/70 px-4 py-3">
                <div>
                  <h3 className="text-sm font-extrabold text-rose-950">Vướng mắc cần xử lý</h3>
                  <p className="text-xs text-rose-800">Triage, phân công và trao đổi</p>
                </div>
                <label className="sr-only" htmlFor="blocker-status-filter">Lọc trạng thái vướng mắc</label>
                <select
                  id="blocker-status-filter"
                  value={blockerStatus}
                  onChange={(event) => setBlockerStatus(event.target.value as typeof blockerStatus)}
                  className="rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 outline-none"
                >
                  <option value="ACTIVE">Đang mở</option>
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="OPEN">Cần xử lý</option>
                  <option value="IN_PROGRESS">Đang xử lý</option>
                  <option value="RESOLVED">Đã giải quyết</option>
                </select>
              </header>
              {filteredBlockers.length === 0 ? <LaneEmpty label="Không có vướng mắc phù hợp." /> : (
                <ul className="searchable-select-scrollbar max-h-[440px] divide-y divide-slate-100 overflow-y-auto overscroll-contain">
                  {filteredBlockers.map((blocker) => (
                    <li key={blocker.id}>
                      <button type="button" onClick={() => void openBlocker(blocker)} className="w-full px-4 py-3 text-left transition hover:bg-rose-50/50">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-slate-900">{blocker.reporterName}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">{blocker.taskCode ? `${blocker.taskCode} · ` : ''}{blocker.projectName ?? blocker.department ?? 'Daily Check-in'}</span>
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-extrabold ${priorityClass(blocker.priority)}`}>{priorityLabel(blocker.priority)}</span>
                        </div>
                        <span className="mt-1 inline-block text-[10px] font-bold text-rose-700">{categoryLabel(blocker.category)}</span>
                        <span className="mt-2 line-clamp-2 block text-xs leading-5 text-slate-600">{blocker.description}</span>
                        <span className="mt-2 flex items-center justify-between gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${statusClass(blocker.status)}`}>{statusLabel(blocker.status)}</span>
                          <span className="truncate text-[10px] text-slate-400">{blocker.assigneeName ? `Phụ trách: ${blocker.assigneeName}` : 'Chưa phân công'} · {blocker.commentCount} trao đổi</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {selectedBlocker && (
        <div
          className="fixed inset-0 z-[80] flex justify-end bg-slate-950/45 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedBlocker(null);
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="blocker-detail-title"
            className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-bold text-rose-700">VƯỚNG MẮC · {selectedBlocker.employeeCode} · {selectedBlocker.checkinDate}</p>
                <h2 id="blocker-detail-title" className="mt-1 truncate text-xl font-extrabold text-slate-950">{selectedBlocker.reporterName}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedBlocker.taskCode ? `${selectedBlocker.taskCode} · ${selectedBlocker.taskTitle ?? ''} · ` : ''}
                  {selectedBlocker.projectName ?? selectedBlocker.department ?? 'Daily Check-in'}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedBlocker(null)} aria-label="Đóng vướng mắc" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
                <X size={18} />
              </button>
            </header>
            {blockerLoading ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Đang tải hồ sơ…</div>
            ) : (
              <div className="searchable-select-scrollbar flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
                <section className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-rose-800">Mô tả vướng mắc</p>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">Ảnh hưởng: {selectedBlocker.impact ?? 'Chưa rõ'}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{selectedBlocker.description}</p>
                  {selectedBlocker.taskStatus && <p className="mt-3 text-xs text-slate-500">Trạng thái task: {taskStatusLabel(selectedBlocker.taskStatus)}</p>}
                </section>

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="text-xs font-bold text-slate-600">
                    Loại vấn đề
                    <select
                      value={selectedBlocker.category}
                      disabled={blockerSaving}
                      onChange={(event) => void updateSelectedBlocker({ category: event.target.value as BlockerCategory })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                    >
                      <option value="TECHNICAL">Kỹ thuật / task</option>
                      <option value="DEPENDENCY">Phụ thuộc</option>
                      <option value="RESOURCE">Nguồn lực</option>
                      <option value="ACCESS">Quyền truy cập</option>
                      <option value="OTHER">Khác</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Trạng thái xử lý
                    <select
                      value={selectedBlocker.status}
                      disabled={blockerSaving}
                      onChange={(event) => void updateSelectedBlocker({ status: event.target.value as BlockerStatus })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                    >
                      <option value="OPEN">Cần xử lý</option>
                      <option value="IN_PROGRESS">Đang xử lý</option>
                      <option value="RESOLVED">Đã giải quyết</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Mức độ ưu tiên
                    <select
                      value={selectedBlocker.priority}
                      disabled={blockerSaving}
                      onChange={(event) => void updateSelectedBlocker({ priority: event.target.value as BlockerPriority })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                    >
                      <option value="CRITICAL">Khẩn cấp</option>
                      <option value="HIGH">Cao</option>
                      <option value="MEDIUM">Trung bình</option>
                      <option value="LOW">Thấp</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Người hỗ trợ
                    <select
                      value={selectedBlocker.assigneeId ?? ''}
                      disabled={blockerSaving}
                      onChange={(event) => void updateSelectedBlocker({ assigneeId: event.target.value ? Number(event.target.value) : null })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                    >
                      <option value="">Chưa phân công</option>
                      {user && !stats?.employees.some((employee) => employee.userId === user.id) && (
                        <option value={user.id}>{user.name} · Tôi</option>
                      )}
                      {stats?.employees.map((employee) => (
                        <option key={employee.userId} value={employee.userId}>{employee.name}{employee.department ? ` · ${employee.department}` : ''}</option>
                      ))}
                    </select>
                  </label>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><MessageSquare size={16} className="text-indigo-600" /> Trao đổi hỗ trợ</h3>
                      <p className="mt-1 text-xs text-slate-500">Bình luận được chia sẻ với nhân sự báo cáo.</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{selectedBlocker.comments.length}</span>
                  </div>
                  {selectedBlocker.comments.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">Chưa có trao đổi nào.</p>
                  ) : (
                    <ul className="space-y-2">
                      {selectedBlocker.comments.map((comment) => (
                        <li key={comment.id} className={`rounded-xl border p-3 ${comment.userId === user?.id ? 'border-indigo-100 bg-indigo-50/60' : 'border-slate-100 bg-slate-50'}`}>
                          <p className="whitespace-pre-wrap text-sm leading-5 text-slate-800">{comment.body}</p>
                          <p className="mt-2 text-[10px] font-semibold text-slate-400">{comment.userName ?? 'Người dùng'} · {formatDateTime(comment.createdAt)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3">
                    <label className="sr-only" htmlFor="blocker-comment">Viết phản hồi</label>
                    <textarea
                      id="blocker-comment"
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                      maxLength={4000}
                      rows={3}
                      placeholder="Ghi hướng xử lý, yêu cầu bổ sung hoặc cập nhật tiến độ..."
                      className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-5 text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400">{commentDraft.length}/4000</span>
                      <button type="button" onClick={() => void addBlockerComment()} disabled={blockerSaving || !commentDraft.trim()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                        {blockerSaving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Gửi phản hồi
                      </button>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-900"><Clock3 size={16} className="text-slate-500" /> Lịch sử xử lý</h3>
                  {selectedBlocker.history.length === 0 ? (
                    <p className="text-xs text-slate-500">Chưa có lịch sử.</p>
                  ) : (
                    <ol className="space-y-3 border-l border-slate-200 pl-4">
                      {selectedBlocker.history.map((entry) => (
                        <li key={entry.id} className="relative">
                          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-500 ring-1 ring-indigo-200" />
                          <p className="text-xs font-bold text-slate-800">{historyLabel(entry.actionType)} · {entry.userName ?? 'Người dùng'}</p>
                          {entry.actionType === 'comment' ? (
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{entry.newValue}</p>
                          ) : (
                            <p className="mt-1 break-words text-xs text-slate-600">
                              {historyValue(entry.actionType, entry.oldValue)}
                              {entry.newValue ? <> <span className="px-1 text-slate-300">→</span>{historyValue(entry.actionType, entry.newValue)}</> : ''}
                            </p>
                          )}
                          <time className="mt-1 block text-[10px] text-slate-400">{formatDateTime(entry.createdAt)}</time>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>
            )}
          </aside>
        </div>
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
                            Trao đổi hỗ trợ
                          </h3>
                          {detail.checkin.blockerComments.length === 0 ? (
                            <p className="mt-3 text-xs text-slate-600">Chưa có trao đổi nào.</p>
                          ) : (
                            <ul className="mt-3 space-y-2">
                              {detail.checkin.blockerComments.map((comment) => (
                                <li key={comment.id} className="rounded-xl border border-blue-100 bg-white p-3">
                                  <p className="whitespace-pre-wrap text-sm leading-5 text-slate-700">{comment.body}</p>
                                  <p className="mt-2 text-[10px] text-slate-400">{comment.userName ?? 'Quản lý'} · {formatDateTime(comment.createdAt)}</p>
                                </li>
                              ))}
                            </ul>
                          )}
                          {detail.checkin.blockerId !== null && (
                            <button type="button" onClick={() => {
                              const blockerId = detail.checkin?.blockerId;
                              if (blockerId !== null && blockerId !== undefined) void openBlockerById(blockerId);
                            }} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-blue-800">
                              Mở hồ sơ triage <ArrowRight size={14} />
                            </button>
                          )}
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

function Avatar({ name, complete = false }: { name: string; complete?: boolean }) {
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-extrabold ${
      complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
    }`}>
      {name.trim().split(/\s+/).slice(-1)[0]?.slice(0, 1).toLocaleUpperCase() ?? '?'}
    </span>
  );
}

function LaneLoading() {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
      <Loader2 size={16} className="animate-spin" /> Đang tải…
    </div>
  );
}

function LaneEmpty({ label }: { label: string }) {
  return <p className="px-4 py-10 text-center text-sm text-slate-500">{label}</p>;
}

function priorityLabel(priority: BlockerPriority): string {
  return {
    CRITICAL: 'Khẩn cấp',
    HIGH: 'Cao',
    MEDIUM: 'Trung bình',
    LOW: 'Thấp',
  }[priority];
}

function priorityClass(priority: BlockerPriority): string {
  return {
    CRITICAL: 'bg-rose-100 text-rose-800',
    HIGH: 'bg-orange-100 text-orange-800',
    MEDIUM: 'bg-amber-100 text-amber-800',
    LOW: 'bg-slate-100 text-slate-700',
  }[priority];
}

function categoryLabel(category: BlockerCategory): string {
  return {
    TECHNICAL: 'Kỹ thuật / task',
    DEPENDENCY: 'Phụ thuộc',
    RESOURCE: 'Nguồn lực',
    ACCESS: 'Quyền truy cập',
    OTHER: 'Khác',
  }[category];
}

function statusLabel(status: BlockerStatus): string {
  return {
    OPEN: 'Cần xử lý',
    IN_PROGRESS: 'Đang xử lý',
    RESOLVED: 'Đã giải quyết',
  }[status];
}

function statusClass(status: BlockerStatus): string {
  return {
    OPEN: 'bg-rose-50 text-rose-700',
    IN_PROGRESS: 'bg-blue-50 text-blue-700',
    RESOLVED: 'bg-emerald-50 text-emerald-700',
  }[status];
}

function historyLabel(action: string): string {
  return {
    reported: 'Báo cáo vướng mắc',
    status: 'Cập nhật trạng thái',
    priority: 'Đổi mức ưu tiên',
    category: 'Phân loại vấn đề',
    assignee: 'Phân công hỗ trợ',
    comment: 'Trao đổi hỗ trợ',
  }[action] ?? action;
}

function historyValue(action: string, value: string | null): string {
  if (value === null) return '—';
  if (action === 'status' && BLOCKER_STATUSES.includes(value as BlockerStatus)) {
    return statusLabel(value as BlockerStatus);
  }
  if (action === 'priority' && ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(value)) {
    return priorityLabel(value as BlockerPriority);
  }
  if (action === 'category' && ['TECHNICAL', 'DEPENDENCY', 'RESOURCE', 'ACCESS', 'OTHER'].includes(value)) {
    return categoryLabel(value as BlockerCategory);
  }
  return value;
}
