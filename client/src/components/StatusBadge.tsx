import { STATUS_META, type TaskStatus } from '../types';

export default function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
      {meta.label}
    </span>
  );
}
