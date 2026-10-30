export const TASK_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'DEV_DONE',
  'TESTING',
  'TEST_FAIL',
  'DONE',
  'PENDING',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task {
  id: number;
  taskCode: string;
  projectId: number;
  project: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: number | null;
  assignee: string | null;
  startDate: string | null;
  estimatedDate: string | null;
  dueDate: string | null;
  actualDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  jobTitle?: string;
  employeeCode?: string;
  department?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';

export interface ProjectMember {
  id: number;
  name: string;
  email: string;
  employee_code?: string;
  employeeCode?: string;
  role_in_project?: string;
}

export interface Project {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  created_at?: string;
  updated_at?: string;
  task_count: number;
  members: ProjectMember[];
}

export interface ManagedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  employeeCode: string;
  jobTitle: string;
  department: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssignableUser {
  id: number;
  name: string;
  email: string;
  employeeCode: string;
  jobTitle: string;
  department: string;
}

export interface AssigneeStat {
  assignee: string;
  total: number;
  todo: number;
  inProgress: number;
  devDone: number;
  testing: number;
  testFail: number;
  done: number;
  pending: number;
  overdue: number;
  completionRate: number;
}

/** Display label + Tailwind classes for each status. */
export const STATUS_META: Record<TaskStatus, { label: string; badge: string }> = {
  TODO: { label: 'To Do', badge: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { label: 'In Progress', badge: 'bg-blue-100 text-blue-700' },
  DEV_DONE: { label: 'Dev Done', badge: 'bg-violet-100 text-violet-700' },
  TESTING: { label: 'Testing', badge: 'bg-amber-100 text-amber-700' },
  TEST_FAIL: { label: 'Test Fail', badge: 'bg-rose-100 text-rose-700' },
  DONE: { label: 'Done', badge: 'bg-emerald-100 text-emerald-700' },
  PENDING: { label: 'Pending', badge: 'bg-rose-100 text-rose-700' },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; badge: string }> = {
  LOW: { label: 'Thấp', badge: 'bg-slate-100 text-slate-600' },
  MEDIUM: { label: 'Trung bình', badge: 'bg-blue-100 text-blue-700' },
  HIGH: { label: 'Cao', badge: 'bg-amber-100 text-amber-700' },
  URGENT: { label: 'Khẩn cấp', badge: 'bg-rose-100 text-rose-700' },
};

export function getTaskPriority(priority: unknown): TaskPriority {
  return typeof priority === 'string' && TASK_PRIORITIES.includes(priority as TaskPriority)
    ? priority as TaskPriority
    : 'MEDIUM';
}

export interface TaskHistoryEntry {
  id: number;
  taskId: number;
  userId: number | null;
  userName: string | null;
  actionType: string;
  oldValue: string | null;
  newValue: string | null;
  timestamp: string;
}

export interface TaskAttachment {
  id: number;
  taskId: number;
  fileName: string;
  mimeType: string;
  dataBase64: string;
  userName: string | null;
  createdAt: string;
}

export function getDeadlineState(
  dueDate: string | null,
  status: TaskStatus,
  now: Date = new Date(),
): 'overdue' | 'soon' | null {
  if (!dueDate || status === 'DONE') return null;
  const [year, month, day] = dueDate.slice(0, 10).split('-').map(Number);
  const deadline = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (
    Number.isNaN(deadline.getTime()) ||
    deadline.getFullYear() !== year ||
    deadline.getMonth() !== month - 1 ||
    deadline.getDate() !== day
  ) return null;
  const remaining = deadline.getTime() - now.getTime();
  if (remaining < 0) return 'overdue';
  return remaining <= 24 * 60 * 60 * 1000 ? 'soon' : null;
}
