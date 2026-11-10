/** Task workflow states supported by the board and API. */
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
  assigneeIds: number[];
  assignees: string[];
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
  createdAt: string;
  updatedAt: string;
}

/** Decoded JWT payload / authenticated principal. */
export interface AuthUser {
  id: number;
  email: string;
}

export interface AuthenticatedUser extends AuthUser {
  role: string;
  jobTitle?: string;
}

export interface CreateTaskInput {
  taskCode?: string;
  projectId: number;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: number | null;
  assigneeIds?: number[];
  startDate?: string | null;
  estimatedDate?: string | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
  loggedHours?: number;
  acceptanceNotes?: string | null;
}

export type UpdateTaskInput = Partial<CreateTaskInput>;
