export const TASK_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'DEV_DONE',
  'TESTING',
  'TEST_FAIL',
  'REVIEW',
  'DONE',
  'GOLIVE',
  'PENDING',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export const STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'PENDING'],
  IN_PROGRESS: ['DEV_DONE', 'PENDING'],
  DEV_DONE: ['TESTING', 'IN_PROGRESS'],
  TESTING: ['REVIEW', 'DONE', 'TEST_FAIL'],
  TEST_FAIL: ['IN_PROGRESS', 'TESTING'],
  REVIEW: ['DONE', 'TEST_FAIL'],
  DONE: ['GOLIVE', 'REVIEW'],
  GOLIVE: [],
  PENDING: ['TODO', 'IN_PROGRESS'],
};
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
  assigneeIds?: number[];
  assignees?: string[];
  startDate: string | null;
  estimatedDate: string | null;
  dueDate: string | null;
  actualDate: string | null;
  completedAt: string | null;
  estimatedHours: number | null;
  loggedHours: number;
  goliveDate: string | null;
  acceptanceNotes: string | null;
  subtaskProgress: number;
  sprintId: number | null;
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
  require_logged_time?: boolean;
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
  username?: string;
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
  review: number;
  golive: number;
  estimatedHours: number;
  loggedHours: number;
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
  REVIEW: { label: 'Review', badge: 'bg-amber-100 text-amber-800' },
  GOLIVE: { label: 'Golive', badge: 'bg-purple-100 text-purple-800' },
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
  fileSize: number;
  dataBase64: string;
  userName: string | null;
  createdAt: string;
}

export function getDeadlineState(
  dueDate: string | null,
  status: TaskStatus,
  now: Date = new Date(),
): 'overdue' | 'soon' | null {
  if (!dueDate || status === 'DONE' || status === 'GOLIVE') return null;
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
