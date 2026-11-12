import { useState, type SyntheticEvent } from 'react';
import { Calendar } from 'lucide-react';

interface TaskDatePickerProps {
  label: string;
  value: string | null;
  editable: boolean;
  className?: string;
  tone?: 'default' | 'overdue' | 'soon';
  onSave: (value: string | null) => Promise<void>;
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '-';
}

export default function TaskDatePicker({
  label,
  value,
  editable,
  className = '',
  tone = 'default',
  onSave,
}: TaskDatePickerProps) {
  const [saving, setSaving] = useState(false);
  const toneClass = tone === 'overdue'
    ? 'text-rose-700'
    : tone === 'soon'
      ? 'text-amber-700'
      : 'text-slate-600';

  if (!editable) {
    return <span className={`${toneClass} ${className}`}>{formatDate(value)}</span>;
  }

  const stopEvent = (event: SyntheticEvent) => event.stopPropagation();
  return (
    <label
      className={`relative inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 hover:bg-blue-50 hover:text-blue-700 ${toneClass} ${className}`}
      title={`${label}: ${formatDate(value)} · Chọn để chỉnh sửa`}
      onClick={stopEvent}
      onMouseDown={stopEvent}
      onTouchStart={stopEvent}
    >
      <Calendar size={12} className="shrink-0" />
      <span className="whitespace-nowrap">{formatDate(value)}</span>
      <input
        type="date"
        aria-label={label}
        value={value?.slice(0, 10) ?? ''}
        disabled={saving}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
        onChange={async (event) => {
          const nextValue = event.currentTarget.value || null;
          setSaving(true);
          try {
            await onSave(nextValue);
          } finally {
            setSaving(false);
          }
        }}
      />
      {saving && <span className="sr-only">Đang lưu ngày...</span>}
    </label>
  );
}
