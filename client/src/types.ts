export const TASK_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'PENDING',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: number;
  taskCode: string;
  projectId: number;
  project: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
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
  inReview: number;
  done: number;
  pending: number;
  overdue: number;
  completionRate: number;
}

/** Display label + Tailwind classes for each status. */
export const STATUS_META: Record<TaskStatus, { label: string; badge: string }> = {
  TODO: { label: 'To Do', badge: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { label: 'In Progress', badge: 'bg-blue-100 text-blue-700' },
  IN_REVIEW: { label: 'In Review', badge: 'bg-amber-100 text-amber-700' },
  DONE: { label: 'Done', badge: 'bg-emerald-100 text-emerald-700' },
  PENDING: { label: 'Pending', badge: 'bg-rose-100 text-rose-700' },
};
