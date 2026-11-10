import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BellRing,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Loader2,
  Megaphone,
  Search,
  Send,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client';

interface Recipient {
  partnerUserId: number;
  name: string;
  email: string;
  jobTitle: string;
  department: string;
}

interface HistoryItem {
  requestId: string;
  title: string;
  body: string;
  sent: number;
  recorded: number;
  failed: number;
  initiatedBy: string;
  createdAt: string;
}

interface SendResult {
  requestId: string;
  sent: number;
  failed: number;
  sentDevices: number;
  failedDevices: number;
  failureReasons?: { code: string; recipients: number }[];
}

const PAGE_SIZE = 10;
const MAX_RECIPIENTS = 50;
const DEFAULT_NOTIFICATION_TYPE = 'GENERAL_NOTIFICATION';
const DEFAULT_NOTIFICATION_SCREEN = 'HOME';

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10';
const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-700';

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'message' in error.response.data &&
    typeof error.response.data.message === 'string'
  ) {
    return error.response.data.message;
  }
  return fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function NotificationManagement() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(true);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientMode, setRecipientMode] = useState<'people' | 'department'>('people');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState(DEFAULT_NOTIFICATION_TYPE);
  const [screen, setScreen] = useState(DEFAULT_NOTIFICATION_SCREEN);
  const [taskId, setTaskId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);

  const departments = useMemo(
    () => [...new Set(recipients.map((recipient) => recipient.department).filter(Boolean))].sort(),
    [recipients],
  );
  const visibleRecipients = useMemo(() => {
    const query = recipientSearch.trim().toLocaleLowerCase();
    return recipients.filter((recipient) => {
      const matchesDepartment =
        recipientMode !== 'department' ||
        !selectedDepartment ||
        recipient.department === selectedDepartment;
      const matchesSearch =
        !query ||
        `${recipient.name} ${recipient.email} ${recipient.department} ${recipient.jobTitle}`
          .toLocaleLowerCase()
          .includes(query);
      return matchesDepartment && matchesSearch;
    });
  }, [recipientMode, recipientSearch, recipients, selectedDepartment]);
  const selectedRecipients = useMemo(
    () => recipients.filter((recipient) => selectedIds.includes(recipient.partnerUserId)),
    [recipients, selectedIds],
  );
  const totalPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE));

  const loadRecipients = useCallback(async () => {
    setRecipientsLoading(true);
    try {
      const response = await api.get<{ data: Recipient[] }>('/admin/notifications/recipients');
      setRecipients(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Không thể tải danh sách người nhận.'));
    } finally {
      setRecipientsLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (page: number, search: string) => {
    setHistoryLoading(true);
    try {
      const response = await api.get<{
        data: HistoryItem[];
        total: number;
        page: number;
      }>('/admin/notifications/history', {
        params: { page, limit: PAGE_SIZE, search: search || undefined },
      });
      setHistory(Array.isArray(response.data?.data) ? response.data.data : []);
      setHistoryTotal(Number(response.data?.total) || 0);
      setHistoryPage(Number(response.data?.page) || page);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Không thể tải lịch sử thông báo.'));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecipients();
    void loadHistory(1, '');
  }, [loadHistory, loadRecipients]);

  const toggleRecipient = (partnerUserId: number) => {
    setSelectedIds((current) => {
      if (current.includes(partnerUserId)) {
        return current.filter((id) => id !== partnerUserId);
      }
      if (current.length >= MAX_RECIPIENTS) {
        toast.error(`Mỗi lần gửi tối đa ${MAX_RECIPIENTS} người nhận.`);
        return current;
      }
      return [...current, partnerUserId];
    });
    setSendResult(null);
  };

  const selectDepartment = () => {
    if (!selectedDepartment) {
      toast.error('Vui lòng chọn phòng ban.');
      return;
    }
    const departmentIds = recipients
      .filter((recipient) => recipient.department === selectedDepartment)
      .map((recipient) => recipient.partnerUserId);
    const merged = [...new Set([...selectedIds, ...departmentIds])];
    if (merged.length > MAX_RECIPIENTS) {
      toast.error(`Danh sách vượt quá giới hạn ${MAX_RECIPIENTS} người nhận. Hãy chọn ít người hơn.`);
      return;
    }
    setSelectedIds(merged);
    setSendResult(null);
  };

  const selectVisible = () => {
    const merged = [...new Set([...selectedIds, ...visibleRecipients.map((item) => item.partnerUserId)])];
    if (merged.length > MAX_RECIPIENTS) {
      toast.error(`Danh sách vượt quá giới hạn ${MAX_RECIPIENTS} người nhận.`);
      return;
    }
    setSelectedIds(merged);
    setSendResult(null);
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setSendResult(null);
  };

  const sendNotification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedIds.length === 0) {
      toast.error('Hãy chọn ít nhất một người nhận.');
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const response = await api.post<SendResult>('/admin/notifications/send', {
        userIds: selectedIds,
        title: title.trim(),
        body: body.trim(),
        data: {
          type,
          screen,
          ...(taskId.trim() ? { taskId: taskId.trim() } : {}),
        },
      });
      setSendResult(response.data);
      toast.success('Đã hoàn tất gửi thông báo.');
      await loadHistory(1, appliedSearch);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Không thể gửi thông báo.'));
    } finally {
      setSending(false);
    }
  };

  const searchHistory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = historySearch.trim();
    setAppliedSearch(query);
    void loadHistory(1, query);
  };

  const changeHistoryPage = (page: number) => {
    if (page < 1 || page > totalPages || page === historyPage) return;
    void loadHistory(page, appliedSearch);
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <Megaphone size={22} />
            </div>
            <p className="text-sm font-semibold text-blue-200">Trung tâm quản trị</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Thông báo</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Gửi thông báo đến nhân sự đang hoạt động được đồng bộ từ Checkin và theo dõi kết quả gửi.
            </p>
          </div>
          <div className="flex w-fit items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <Users size={19} className="text-blue-200" />
            <div>
              <p className="text-lg font-bold">{recipients.length}</p>
              <p className="text-xs text-slate-300">người nhận khả dụng</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <form onSubmit={sendNotification} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Tạo thông báo</h2>
              <p className="mt-1 text-sm text-slate-500">Chọn người nhận và nhập nội dung gửi.</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              <BellRing size={14} /> Push notification
            </span>
          </div>

          <div className="hidden grid gap-4 sm:grid-cols-2">
            <label>
              <span className={labelClass}>Loại thông báo</span>
              <select value={type} onChange={(event) => setType(event.target.value)} className={fieldClass}>
                <option value="GENERAL_NOTIFICATION">Thông báo chung</option>
                <option value="TASK_ASSIGNED">Giao công việc</option>
                <option value="TASK_UPDATED">Cập nhật công việc</option>
                <option value="ANNOUNCEMENT">Thông báo nội bộ</option>
              </select>
            </label>
            <label>
              <span className={labelClass}>Màn hình đích</span>
              <select value={screen} onChange={(event) => setScreen(event.target.value)} className={fieldClass}>
                <option value="HOME">Trang chủ</option>
                <option value="TASK_LIST">Danh sách công việc</option>
                <option value="TASK_DETAIL">Chi tiết công việc</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Tiêu đề</span>
            <input
              required
              maxLength={255}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={fieldClass}
              placeholder="Ví dụ: Bạn có công việc cần xử lý"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Nội dung</span>
            <textarea
              required
              maxLength={4000}
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className={`${fieldClass} resize-y`}
              placeholder="Nhập nội dung thông báo..."
            />
            <span className="mt-1 block text-right text-xs text-slate-400">{body.length}/4000</span>
          </label>
          <label className="block">
            <span className={labelClass}>Task ID <span className="font-normal text-slate-400">(không bắt buộc)</span></span>
            <input
              value={taskId}
              maxLength={128}
              onChange={(event) => setTaskId(event.target.value)}
              className={fieldClass}
              placeholder="Ví dụ: TASK-0073"
            />
          </label>

          <div className="border-t border-slate-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Người nhận</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Đã chọn <strong className="text-slate-800">{selectedIds.length}</strong> / {MAX_RECIPIENTS}
                </p>
              </div>
              <button type="button" onClick={clearSelection} className="text-xs font-semibold text-slate-500 hover:text-rose-600">
                Bỏ chọn tất cả
              </button>
            </div>

            <div className="mt-4 inline-flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setRecipientMode('people')}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${recipientMode === 'people' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
              >
                Từng nhân sự
              </button>
              <button
                type="button"
                onClick={() => setRecipientMode('department')}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${recipientMode === 'department' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
              >
                Theo phòng ban
              </button>
            </div>

            {recipientMode === 'department' && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select
                  value={selectedDepartment}
                  onChange={(event) => setSelectedDepartment(event.target.value)}
                  className={`${fieldClass} min-w-0 flex-1`}
                >
                  <option value="">Chọn phòng ban</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
                <button
                  type="button"
                  onClick={selectDepartment}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                >
                  Chọn phòng ban
                </button>
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={recipientSearch}
                  onChange={(event) => setRecipientSearch(event.target.value)}
                  className={`${fieldClass} pl-9`}
                  placeholder="Tìm tên, email hoặc phòng ban"
                />
              </div>
              <button type="button" onClick={selectVisible} className="shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                Chọn danh sách
              </button>
            </div>

            <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-200">
              {recipientsLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                  <Loader2 size={17} className="animate-spin" /> Đang tải danh sách...
                </div>
              ) : visibleRecipients.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">Không tìm thấy nhân sự phù hợp.</div>
              ) : (
                visibleRecipients.map((recipient) => {
                  const checked = selectedIds.includes(recipient.partnerUserId);
                  return (
                    <label
                      key={recipient.partnerUserId}
                      className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3.5 py-3 last:border-0 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRecipient(recipient.partnerUserId)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                        {recipient.name.trim().slice(0, 1).toLocaleUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">{recipient.name}</span>
                        <span className="block truncate text-xs text-slate-500">{recipient.email}</span>
                      </span>
                      <span className="hidden max-w-32 truncate rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 sm:block">
                        {recipient.department || 'Chưa có phòng ban'}
                      </span>
                      {checked && <Check size={16} className="text-blue-600" />}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {sendResult && (
            <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <Check size={18} className="mt-0.5 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-emerald-800">Đã xử lý yêu cầu gửi</p>
                <p className="mt-1 text-sm text-emerald-700">
                  Thành công: <strong>{sendResult.sent}</strong> · Thất bại: <strong>{sendResult.failed}</strong>
                </p>
                {sendResult.failureReasons && sendResult.failureReasons.length > 0 && (
                  <p className="mt-1 text-xs text-emerald-800">
                    Chi tiết lỗi: {sendResult.failureReasons.map((reason) => `${reason.code} (${reason.recipients})`).join(', ')}
                  </p>
                )}
                <p className="mt-1 break-all text-xs text-emerald-700/80">Mã yêu cầu: {sendResult.requestId}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={sending || recipientsLoading || recipients.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={16} />}
            {sending ? 'Đang gửi...' : `Gửi thông báo${selectedIds.length ? ` đến ${selectedIds.length} người` : ''}`}
          </button>
        </form>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Clock3 size={19} /></span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Lịch sử gửi</h2>
                <p className="text-sm text-slate-500">{historyTotal} lượt gửi</p>
              </div>
            </div>
            <form onSubmit={searchHistory} className="mt-4 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  className={`${fieldClass} pl-9`}
                  placeholder="Tìm theo tiêu đề, nội dung, admin"
                />
              </div>
              <button type="submit" className="rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700">Tìm</button>
            </form>
          </div>

          <div className="divide-y divide-slate-100">
            {historyLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 size={17} className="animate-spin" /> Đang tải lịch sử...
              </div>
            ) : history.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <CircleAlert size={25} className="mx-auto text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-600">Chưa có thông báo nào</p>
                <p className="mt-1 text-xs text-slate-400">Các lượt gửi sẽ xuất hiện tại đây.</p>
              </div>
            ) : (
              history.map((item) => (
                <article key={item.requestId} className="p-5 transition hover:bg-slate-50/70">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-slate-900">{item.title}</h3>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm leading-5 text-slate-500">{item.body}</p>
                    </div>
                    <time className="shrink-0 text-xs text-slate-400">{formatDate(item.createdAt)}</time>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                    <span className="font-semibold text-emerald-700">Thành công {item.sent}</span>
                    {item.recorded > 0 && (
                      <span className="font-semibold text-blue-700">Đã ghi nhận {item.recorded}</span>
                    )}
                    <span className="font-semibold text-rose-600">Thất bại {item.failed}</span>
                    <span className="text-slate-500">Bởi {item.initiatedBy || 'Đối tác / hệ thống'}</span>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5">
            <span className="text-xs text-slate-500">
              Trang {historyPage} / {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={historyPage <= 1 || historyLoading}
                onClick={() => changeHistoryPage(historyPage - 1)}
                aria-label="Trang trước"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                disabled={historyPage >= totalPages || historyLoading}
                onClick={() => changeHistoryPage(historyPage + 1)}
                aria-label="Trang sau"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
