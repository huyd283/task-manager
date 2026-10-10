/** The five task states supported by the board. */
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
  assigneeId?: number | null;
  startDate?: string | null;
  estimatedDate?: string | null;
  dueDate?: string | null;
  actualDate?: string | null;
}

export type UpdateTaskInput = Partial<CreateTaskInput>;
