import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  STATUS_META,
  STATUS_TRANSITIONS,
  type Task,
  type TaskStatus,
} from '../types';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Edit3,
  Loader2,
  Plus,
  Search,
  Save,
  ShieldAlert,
  X,
} from 'lucide-react';

type BlockerStatus = 'NONE' | 'BLOCKED';
type BlockerImpact = 'LOW' | 'MEDIUM' | 'HIGH';

interface CheckinRecord {
  reviewedTaskIds: number[];
  reviewConfirmed: boolean;
  plannedTaskIds: number[];
  planConfirmed: boolean;
  blockerStatus: BlockerStatus | null;
  blockerDescription: string | null;
  blockerTaskId: number | null;
  blockerImpact: BlockerImpact | null;
  isComplete: boolean;
  completedAt: string | null;
  savedAt: string | null;
}

interface CheckinData {
  date: string;
  tasks: Task[];
  checkin: CheckinRecord | null;
}

interface BlockerReport {
  id: number | string;
  checkinDate: string;
  description: string;
  impact: BlockerImpact;
  taskId: number | null;
  userId: number;
  userName: string;
  department: string | null;
  taskCode: string | null;
  taskTitle: string | null;
  projectName: string | null;
}

interface DailyCheckinProps {
  onCreateTask: () => void;
}

const IMPACT_LABEL: Record<BlockerImpact, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
};

function getErrorMessage(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
}

function displayDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN');
}

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase();
}

export default function DailyCheckin({ onCreateTask }: DailyCheckinProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<CheckinData | null>(null);
  const [statusValues, setStatusValues] = useState<Record<number, TaskStatus>>({});
  const [dateValues, setDateValues] = useState<Record<number, { startDate: string; dueDate: string }>>({});
  const [reviewSearch, setReviewSearch] = useState('');
  const [planSearch, setPlanSearch] = useState('');
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewedTaskIds, setReviewedTaskIds] = useState<number[]>([]);
  const [planConfirmed, setPlanConfirmed] = useState(false);
  const [plannedTaskIds, setPlannedTaskIds] = useState<number[]>([]);
  const [blockerStatus, setBlockerStatus] = useState<BlockerStatus | null>(null);
  const [blockerDescription, setBlockerDescription] = useState('');
  const [blockerTaskId, setBlockerTaskId] = useState<number | null>(null);
  const [blockerImpact, setBlockerImpact] = useState<BlockerImpact>('MEDIUM');
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [blockers, setBlockers] = useState<BlockerReport[]>([]);
  const [blockersError, setBlockersError] = useState('');

  const canSeeBlockers = user?.role === 'admin' || user?.isAccAdmin === true || user?.jobTitle === 'Project Lead';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await api.get<{ data: CheckinData }>('/tasks/daily-checkin/today');
      const next = response.data.data;
      setData(next);
      setStatusValues(Object.fromEntries(next.tasks.map((task) => [task.id, task.status])));
      setDateValues(Object.fromEntries(next.tasks.map((task) => [task.id, {
        startDate: task.startDate?.slice(0, 10) ?? '',
        dueDate: task.dueDate?.slice(0, 10) ?? '',
      }])));
      const record = next.checkin;
      setReviewConfirmed(record?.reviewConfirmed ?? false);
      setReviewedTaskIds(record?.reviewedTaskIds ?? []);
      setPlanConfirmed(record?.planConfirmed ?? false);
      setPlannedTaskIds(record?.plannedTaskIds ?? []);
      setBlockerStatus(record?.blockerStatus ?? null);
      setBlockerDescription(record?.blockerDescription ?? '');
      setBlockerTaskId(record?.blockerTaskId ?? null);
      setBlockerImpact(record?.blockerImpact ?? 'MEDIUM');
      setEditing(!record?.isComplete);
    } catch (error) {
      const message = getErrorMessage(error, 'Không tải được Daily Check-in.');
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBlockers = useCallback(async () => {
    if (!canSeeBlockers) return;
    setBlockersError('');
    try {
      const response = await api.get<{ data: BlockerReport[] }>('/tasks/daily-checkin/blockers');
      setBlockers(response.data.data ?? []);
    } catch (error) {
      setBlockersError(getErrorMessage(error, 'Không tải được danh sách vướng mắc.'));
    }
  }, [canSeeBlockers]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadBlockers(); }, [loadBlockers]);

  const tasks = data?.tasks ?? [];
  const matchesSearch = (task: Task, query: string) => {
    const term = normalizeSearch(query.trim());
    if (!term) return true;
    return [task.taskCode, task.title, task.project ?? '']
      .some((value) => normalizeSearch(value).includes(term));
  };
  const reviewTasks = tasks.filter((task) => matchesSearch(task, reviewSearch));
  const planTasks = tasks.filter((task) => task.status !== 'GOLIVE' && matchesSearch(task, planSearch));
  const plannedTasks = useMemo(
    () => plannedTaskIds.map((id) => tasks.find((task) => task.id === id)).filter((task): task is Task => Boolean(task)),
    [plannedTaskIds, tasks],
  );
  const completedYesterday = tasks.filter((task) =>
    (statusValues[task.id] ?? task.status) === 'DONE' || (statusValues[task.id] ?? task.status) === 'GOLIVE',
  );
  const completedSteps = Number(reviewConfirmed) + Number(planConfirmed) + Number(blockerStatus !== null);

  const save = async (complete: boolean) => {
    if (!data) return;
    if (complete && completedSteps !== 3) {
      toast.error('Hãy hoàn tất đủ 3 bước trước khi gửi cập nhật.');
      return;
    }
    if (complete && blockerStatus === 'BLOCKED' && !blockerDescription.trim()) {
      toast.error('Vui lòng mô tả vướng mắc để quản lý có thể hỗ trợ.');
      return;
    }
    const startingWithoutDates = tasks.find((task) =>
      task.status !== 'IN_PROGRESS' &&
      statusValues[task.id] === 'IN_PROGRESS' &&
      (!dateValues[task.id]?.startDate || !dateValues[task.id]?.dueDate),
    );
    if (startingWithoutDates) {
      toast.error(`Cần nhập ngày bắt đầu và ngày kết thúc cho ${startingWithoutDates.taskCode}.`);
      return;
    }
    const statusUpdates = tasks
      .filter((task) => statusValues[task.id] && statusValues[task.id] !== task.status)
      .map((task) => ({
        taskId: task.id,
        status: statusValues[task.id],
        ...(statusValues[task.id] === 'IN_PROGRESS' && task.status !== 'IN_PROGRESS'
          ? dateValues[task.id]
          : {}),
      }));
    setSaving(true);
    try {
      await api.post('/tasks/daily-checkin', {
        reviewedTaskIds,
        reviewConfirmed,
        plannedTaskIds,
        planConfirmed,
        blockerStatus,
        blockerDescription: blockerStatus === 'BLOCKED' ? blockerDescription.trim() : null,
        blockerTaskId: blockerStatus === 'BLOCKED' ? blockerTaskId : null,
        blockerImpact: blockerStatus === 'BLOCKED' ? blockerImpact : null,
        statusUpdates,
        complete,
      });
      toast.success(complete ? 'Đã hoàn tất Daily Check-in.' : 'Đã lưu bản nháp.');
      await load();
      await loadBlockers();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Không thể lưu Daily Check-in.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        <Loader2 size={17} className="animate-spin" /> Đang tải Daily Check-in…
      </div>
    );
  }
  if (!data) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
        <span>{loadError || 'Không thể tải Daily Check-in.'}</span>
        <button type="button" onClick={() => void load()} className="font-bold underline">Thử lại</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canSeeBlockers && (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <ShieldAlert size={18} className="text-amber-700" />
              <h2 className="text-sm font-extrabold text-slate-900">Vướng mắc cần hỗ trợ</h2>
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-extrabold text-amber-900">{blockers.length}</span>
            </div>
            <button type="button" onClick={() => void loadBlockers()} className="text-xs font-bold text-amber-800 hover:underline">Làm mới</button>
          </div>
          {blockersError ? (
            <p role="alert" className="px-5 py-4 text-sm text-rose-700">{blockersError}</p>
          ) : blockers.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">Chưa có vướng mắc nào được báo cáo hôm nay.</p>
          ) : (
            <ul className="divide-y divide-amber-100">
              {blockers.map((blocker) => (
                <li key={blocker.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{blocker.userName}{blocker.department ? ` · ${blocker.department}` : ''}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{blocker.description}</p>
                    {(blocker.taskCode || blocker.projectName) && (
                      <p className="mt-1 text-xs text-slate-500">
                        {blocker.taskCode && `${blocker.taskCode}${blocker.taskTitle ? ` · ${blocker.taskTitle}` : ''}`}
                        {blocker.projectName && ` · ${blocker.projectName}`}
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${blocker.impact === 'HIGH' ? 'bg-rose-100 text-rose-700' : blocker.impact === 'MEDIUM' ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-slate-700'}`}>
                    Ảnh hưởng: {IMPACT_LABEL[blocker.impact]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {data?.checkin?.isComplete && !editing ? (
        <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={20} /></span>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">Daily Check-in đã hoàn tất</h2>
                  <p className="text-xs text-slate-500">{displayDate(data.date)} · Đã cập nhật</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
                <Edit3 size={14} /> Chỉnh sửa cập nhật
              </button>
              <button type="button" onClick={() => navigate('/tasks?plan=today')} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700">
                Xem công việc <ArrowRight size={14} />
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Hôm qua</p>
              <p className="mt-2 text-base font-bold text-slate-900">{completedYesterday.length} task hoàn thành</p>
              <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-slate-600">{completedYesterday.map((task) => task.title).join(', ') || 'Đã rà soát công việc được giao'}</p>
            </div>
            <div className="rounded-xl bg-blue-50/70 p-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-blue-800">Hôm nay</p>
              <p className="mt-2 text-base font-bold text-slate-900">{plannedTasks.length ? `${plannedTasks.length} task ưu tiên` : 'Chưa chọn task ưu tiên'}</p>
              <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-slate-700">{plannedTasks.map((task) => task.title).join(', ') || 'Kế hoạch đã được xác nhận'}</p>
            </div>
            <div className={`rounded-xl p-4 ${data.checkin.blockerStatus === 'BLOCKED' ? 'bg-rose-50' : 'bg-emerald-50'}`}>
              <p className={`text-xs font-extrabold uppercase tracking-wide ${data.checkin.blockerStatus === 'BLOCKED' ? 'text-rose-800' : 'text-emerald-800'}`}>Vướng mắc</p>
              <p className="mt-2 text-base font-bold text-slate-900">{data.checkin.blockerStatus === 'BLOCKED' ? 'Cần hỗ trợ' : 'Không có'}</p>
              <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-slate-700">{data.checkin.blockerStatus === 'BLOCKED' ? data.checkin.blockerDescription : 'Không có vướng mắc được báo cáo'}</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
          <header className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50 via-white to-indigo-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-100 text-blue-700"><ClipboardCheck size={19} /></span>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Daily Check-in</h2>
                  <p className="mt-0.5 text-sm text-slate-600">{displayDate(data.date)} · Cập nhật nhanh từ công việc được giao</p>
                </div>
              </div>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-800">
              <Clock3 size={13} /> {data?.checkin ? 'Bản nháp' : 'Chưa cập nhật'}
            </span>
          </header>

          <div className="grid items-stretch divide-y divide-slate-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            <section className="flex min-h-0 flex-col p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-black text-blue-700">1</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-extrabold text-slate-900">1. Hôm qua đã làm gì?</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-600">Rà soát task và cập nhật trạng thái mới nhất.</p>
                </div>
              </div>
              <label className="relative mt-4 block shrink-0">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  role="searchbox"
                  value={reviewSearch}
                  onChange={(event) => setReviewSearch(event.target.value)}
                  placeholder="Tìm mã, tên task hoặc dự án..."
                  aria-label="Tìm công việc để rà soát"
                  className="daily-checkin-search w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
                {reviewSearch && (
                  <button type="button" onClick={() => setReviewSearch('')} aria-label="Xóa tìm kiếm rà soát" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                    <X size={15} />
                  </button>
                )}
              </label>
              <div className="searchable-select-scrollbar mt-3 max-h-[360px] min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
                {tasks.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">Chưa có task được giao.</p>
                ) : reviewTasks.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">Không tìm thấy công việc phù hợp.</p>
                ) : reviewTasks.map((task) => {
                  const currentStatus = statusValues[task.id] ?? task.status;
                  const options = [currentStatus, ...STATUS_TRANSITIONS[task.status]]
                    .filter((status, index, list) => list.indexOf(status) === index);
                  return (
                    <article key={task.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-extrabold text-blue-800">{task.taskCode}</p>
                          <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-900">{task.title}</p>
                          <p className="mt-1.5 truncate text-xs text-slate-600">{task.project || 'Chưa phân dự án'}</p>
                        </div>
                        <select
                          aria-label={`Trạng thái ${task.taskCode}`}
                          value={currentStatus}
                          onChange={(event) => setStatusValues((previous) => ({
                            ...previous,
                            [task.id]: event.target.value as TaskStatus,
                          }))}
                          className="max-w-36 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-800"
                        >
                          {options.map((status) => <option key={status} value={status}>{STATUS_META[status].label}</option>)}
                        </select>
                      </div>
                      {currentStatus === 'IN_PROGRESS' && task.status !== 'IN_PROGRESS' && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="text-xs font-bold text-slate-600">
                            Ngày bắt đầu
                            <input
                              type="date"
                              value={dateValues[task.id]?.startDate ?? ''}
                              onChange={(event) => setDateValues((previous) => ({
                                ...previous,
                                [task.id]: { ...previous[task.id], startDate: event.target.value },
                              }))}
                              className="mt-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-800"
                            />
                          </label>
                          <label className="text-xs font-bold text-slate-600">
                            Hạn hoàn thành
                            <input
                              type="date"
                              value={dateValues[task.id]?.dueDate ?? ''}
                              onChange={(event) => setDateValues((previous) => ({
                                ...previous,
                                [task.id]: { ...previous[task.id], dueDate: event.target.value },
                              }))}
                              className="mt-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-800"
                            />
                          </label>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  setReviewedTaskIds(tasks.map((task) => task.id));
                  setReviewConfirmed(true);
                }}
                className={`mt-auto inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-3 pt-3 text-sm font-extrabold transition ${reviewConfirmed ? 'bg-emerald-50 text-emerald-700' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
              >
                <Check size={14} /> {reviewConfirmed ? 'Đã xác nhận rà soát' : 'Xác nhận đã rà soát'}
              </button>
            </section>

            <section className="flex min-h-0 flex-col p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700">2</span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">2. Kế hoạch hôm nay</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-600">Chọn task ưu tiên; task mới có thể tạo ngay.</p>
                </div>
              </div>
              <label className="relative mt-4 block shrink-0">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  role="searchbox"
                  value={planSearch}
                  onChange={(event) => setPlanSearch(event.target.value)}
                  placeholder="Tìm mã, tên task hoặc dự án..."
                  aria-label="Tìm công việc cho kế hoạch hôm nay"
                  className="daily-checkin-search w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
                {planSearch && (
                  <button type="button" onClick={() => setPlanSearch('')} aria-label="Xóa tìm kiếm kế hoạch" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                    <X size={15} />
                  </button>
                )}
              </label>
              <div className="searchable-select-scrollbar mt-3 max-h-[360px] min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
                {tasks.filter((task) => task.status !== 'GOLIVE').length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">Chưa có task để lên kế hoạch.</p>
                ) : planTasks.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">Không tìm thấy công việc phù hợp.</p>
                ) : planTasks.map((task) => (
                  <label key={task.id} className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={plannedTaskIds.includes(task.id)}
                      onChange={(event) => {
                        setPlannedTaskIds((previous) => event.target.checked
                          ? [...previous, task.id]
                          : previous.filter((id) => id !== task.id));
                        setPlanConfirmed(false);
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{task.taskCode} · {task.title}</span>
                      <span className="mt-1 block truncate text-xs text-slate-600">{task.project || 'Chưa phân dự án'}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{STATUS_META[task.status].label}</span>
                  </label>
                ))}
              </div>
              <div className="mt-auto flex shrink-0 gap-2 pt-3">
                <button type="button" onClick={onCreateTask} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-blue-200 px-3 py-2.5 text-xs font-extrabold text-blue-700 transition hover:bg-blue-50">
                  <Plus size={14} /> Tạo mới
                </button>
                <button
                  type="button"
                  onClick={() => setPlanConfirmed(true)}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-extrabold transition ${planConfirmed ? 'bg-emerald-50 text-emerald-700' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  <Check size={14} /> {planConfirmed ? 'Đã xác nhận' : 'Xác nhận kế hoạch'}
                </button>
              </div>
            </section>

            <section className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rose-100 text-xs font-black text-rose-700">3</span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">3. Khó khăn &amp; vướng mắc</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-600">Báo sớm để quản lý và đồng đội hỗ trợ.</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBlockerStatus('NONE');
                    setBlockerDescription('');
                    setBlockerTaskId(null);
                    setBlockerImpact('MEDIUM');
                  }}
                  className={`rounded-xl border px-3 py-3 text-xs font-extrabold transition ${blockerStatus === 'NONE' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  Không có
                </button>
                <button
                  type="button"
                  onClick={() => setBlockerStatus('BLOCKED')}
                  className={`rounded-xl border px-3 py-3 text-xs font-extrabold transition ${blockerStatus === 'BLOCKED' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  Có vướng mắc
                </button>
              </div>
              {blockerStatus === 'BLOCKED' && (
                <div className="mt-3 space-y-2.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Mô tả vướng mắc
                    <textarea
                      value={blockerDescription}
                      onChange={(event) => setBlockerDescription(event.target.value)}
                      maxLength={2000}
                      rows={3}
                      placeholder="Mô tả ngắn gọn điều đang cản trở công việc…"
                      className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal leading-5 text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Task liên quan (không bắt buộc)
                    <select value={blockerTaskId ?? ''} onChange={(event) => setBlockerTaskId(event.target.value ? Number(event.target.value) : null)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                      <option value="">Chưa liên kết task</option>
                      {tasks.map((task) => <option key={task.id} value={task.id}>{task.taskCode} · {task.title}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Mức độ ảnh hưởng
                    <select value={blockerImpact} onChange={(event) => setBlockerImpact(event.target.value as BlockerImpact)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                      <option value="LOW">Thấp</option>
                      <option value="MEDIUM">Trung bình</option>
                      <option value="HIGH">Cao - cần xử lý sớm</option>
                    </select>
                  </label>
                </div>
              )}
              {blockerStatus === null && (
                <p className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"><AlertCircle size={15} /> Chọn “Không có” hoặc “Có vướng mắc” để hoàn tất bước này.</p>
              )}
            </section>
          </div>

          <footer className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((step) => <span key={step} className={`h-1.5 w-8 rounded-full ${step < completedSteps ? 'bg-emerald-500' : 'bg-slate-200'}`} />)}
              </div>
              <span className="text-xs font-bold text-slate-600">{completedSteps}/3 bước đã hoàn tất</span>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" disabled={saving} onClick={() => void save(false)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lưu bản nháp
              </button>
              <button type="button" disabled={saving} onClick={() => void save(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Hoàn tất cập nhật <ArrowRight size={14} />
              </button>
            </div>
          </footer>
        </section>
      )}
    </div>
  );
}
