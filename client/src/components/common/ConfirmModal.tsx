import { useState } from 'react';
import { AlertTriangle, LoaderCircle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<boolean | void> | boolean | void;
}

export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  destructive = false,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const [pending, setPending] = useState(false);
  if (!open) return null;

  const runConfirmedAction = async () => {
    setPending(true);
    try {
      const succeeded = await onConfirm();
      if (succeeded !== false) onCancel();
    } catch {
      // The action owner reports errors; keep the confirmation available for retry.
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-description"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-950/25"
      >
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500" />
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${destructive ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-700'}`}>
              <AlertTriangle size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="confirm-modal-title" className="text-base font-extrabold text-slate-900">{title}</h2>
              <p id="confirm-modal-description" className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </div>
            <button type="button" disabled={pending} onClick={onCancel} title="Đóng" className="-mr-2 -mt-2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40">
              <X size={17} />
            </button>
          </div>
          <div className="mt-7 flex justify-end gap-2">
            <button type="button" disabled={pending} onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
              {cancelLabel}
            </button>
            <button type="button" disabled={pending} onClick={() => void runConfirmedAction()} className={`inline-flex min-w-28 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white transition disabled:cursor-wait disabled:opacity-60 ${destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'}`}>
              {pending && <LoaderCircle size={14} className="animate-spin" />}
              {pending ? 'Đang xử lý...' : confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}