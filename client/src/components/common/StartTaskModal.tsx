import { useState, type FormEvent } from 'react';
import { Calendar, X } from 'lucide-react';
import ModalPortal from './ModalPortal';
import type { Task } from '../../types';

interface StartTaskModalProps {
  task: Task;
  onCancel: () => void;
  onConfirm: (dates: { startDate: string; dueDate: string }) => Promise<void>;
}

export default function StartTaskModal({ task, onCancel, onConfirm }: StartTaskModalProps) {
  const [startDate, setStartDate] = useState(task.startDate?.slice(0, 10) ?? '');
  const [dueDate, setDueDate] = useState(task.dueDate?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!startDate || !dueDate) {
      setError('Vui lòng nhập cả ngày bắt đầu và ngày kết thúc.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm({ startDate, dueDate });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể bắt đầu công việc.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
        <form onSubmit={(event) => void submit(event)} className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-blue-700">
                <Calendar size={18} />
                <h2 className="text-base font-extrabold">Bắt đầu công việc</h2>
              </div>
              <p className="mt-1 text-xs text-slate-500">{task.taskCode} · {task.title}</p>
            </div>
            <button type="button" onClick={onCancel} disabled={saving} aria-label="Hủy" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={17} />
            </button>
          </div>
          <p className="text-xs text-slate-600">Xác nhận hoặc điều chỉnh hai mốc ngày trước khi chuyển task sang Đang thực hiện.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-bold text-slate-700">
              Ngày bắt đầu
              <input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-slate-700">
              Ngày kết thúc
              <input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </label>
          </div>
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Hủy</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
              {saving ? 'Đang lưu...' : 'Lưu ngày và bắt đầu'}
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}
