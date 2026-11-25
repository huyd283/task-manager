import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
import { HttpError } from '../middleware/errorHandler';

export type DailyCheckinExportStatus = 'Submitted' | 'Pending' | 'hasBlocker';

export interface DailyCheckinExportFilters {
  fromDate: string;
  toDate: string;
  userId?: number;
  departmentId?: string;
  teamId?: number;
  status?: DailyCheckinExportStatus;
}

interface CheckinExportRow extends RowDataPacket {
  checkinDate: string;
  userId: number | string;
  name: string;
  employeeCode: string;
  jobTitle: string;
  department: string | null;
  checkinId: number | string | null;
  isComplete: number | null;
  reviewConfirmed: number | null;
  planConfirmed: number | null;
  reviewedTaskIds: string | null;
  blockerStatus: 'NONE' | 'BLOCKED' | null;
  blockerDescription: string | null;
  blockerImpact: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  completedAt: string | null;
  savedAt: string | null;
}

interface TaskExportRow extends RowDataPacket {
  checkinDate?: string;
  userId?: number | string;
  id: number | string;
  taskCode: string | null;
  title: string;
  status: string;
  projectName: string | null;
}

export interface DailyCheckinExportTask {
  id: number;
  taskCode: string | null;
  title: string | null;
  status: string | null;
  projectName: string | null;
}

export interface DailyCheckinExportRecord {
  date: string;
  submissionStatus: 'Submitted' | 'Pending';
  user: {
    userId: number;
    name: string;
    employeeCode: string;
    jobTitle: string;
    department: string | null;
  };
  checkin: {
    submissionStatus: 'Submitted' | 'Pending';
    isComplete: boolean;
    reviewConfirmed: boolean;
    planConfirmed: boolean;
    blockerStatus: 'NONE' | 'BLOCKED' | null;
    blockerDescription: string | null;
    blockerImpact: 'LOW' | 'MEDIUM' | 'HIGH' | null;
    completedAt: string | null;
    savedAt: string | null;
  } | null;
  reviewedTasks: DailyCheckinExportTask[];
  plannedTasks: DailyCheckinExportTask[];
  hasBlocker: boolean;
}

function parseReviewedTaskIds(value: string | null): number[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Stored Daily Check-in has invalid reviewed task data');
  }
  if (!Array.isArray(parsed) || parsed.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    throw new Error('Stored Daily Check-in has invalid reviewed task data');
  }
  return [...new Set(parsed.map(Number))];
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

export async function loadDailyCheckinExport(
  filters: DailyCheckinExportFilters,
): Promise<DailyCheckinExportRecord[]> {
  const dates: string[] = [];
  for (let date = filters.fromDate; date <= filters.toDate;) {
    dates.push(date);
    const next = new Date(`${date}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
  }

  const dateSelect = dates.map(() => 'SELECT CAST(? AS DATE) AS checkin_date').join(' UNION ALL ');
  const clauses = ['u.is_active = 1', "u.role <> 'admin'", 'u.is_acc_admin = 0'];
  const params: unknown[] = [...dates];
  if (filters.userId !== undefined) {
    clauses.push('u.id = ?');
    params.push(filters.userId);
  }
  if (filters.departmentId !== undefined) {
    clauses.push('u.department = ?');
    params.push(filters.departmentId);
  }
  if (filters.teamId !== undefined) {
    clauses.push(`EXISTS (
      SELECT 1 FROM project_members project_member
      WHERE project_member.project_id = ? AND project_member.user_id = u.id
    )`);
    params.push(filters.teamId);
  }
  if (filters.status === 'Submitted') clauses.push('c.is_complete = 1');
  if (filters.status === 'Pending') clauses.push('(c.id IS NULL OR c.is_complete = 0)');
  if (filters.status === 'hasBlocker') clauses.push("c.blocker_status = 'BLOCKED'");

  const [rows] = await pool.query<CheckinExportRow[]>(
    `SELECT DATE_FORMAT(report_dates.checkin_date, '%Y-%m-%d') AS checkinDate,
            u.id AS userId, u.name, u.employee_code AS employeeCode,
            u.job_title AS jobTitle, u.department,
            c.id AS checkinId, c.is_complete AS isComplete,
            c.review_confirmed AS reviewConfirmed, c.plan_confirmed AS planConfirmed,
            c.reviewed_task_ids AS reviewedTaskIds, c.blocker_status AS blockerStatus,
            c.blocker_description AS blockerDescription, c.blocker_impact AS blockerImpact,
            DATE_FORMAT(c.completed_at, '%Y-%m-%d %H:%i:%s') AS completedAt,
            DATE_FORMAT(c.updated_at, '%Y-%m-%d %H:%i:%s') AS savedAt
     FROM users u
     CROSS JOIN (${dateSelect}) report_dates
     LEFT JOIN daily_checkins c
       ON c.user_id = u.id AND c.checkin_date = report_dates.checkin_date
     WHERE ${clauses.join(' AND ')}
     ORDER BY report_dates.checkin_date, u.name, u.id
     LIMIT 20001`,
    params,
  );
  if (rows.length > 20000) {
    throw new HttpError(413, 'Export exceeds the 20000-record limit; narrow the filters');
  }
  if (rows.length === 0) return [];

  const reviewedIdsByRecord = rows.map((row) => parseReviewedTaskIds(row.reviewedTaskIds));
  const reviewedIds = [...new Set(reviewedIdsByRecord.flat())];
  const taskById = new Map<number, DailyCheckinExportTask>();
  for (const batch of chunks(reviewedIds, 500)) {
    const [taskRows] = await pool.query<TaskExportRow[]>(
      `SELECT t.id, t.task_code AS taskCode, t.title, t.status, p.name AS projectName
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.id IN (${batch.map(() => '?').join(',')})`,
      batch,
    );
    for (const task of taskRows) {
      taskById.set(Number(task.id), {
        id: Number(task.id),
        taskCode: task.taskCode,
        title: task.title,
        status: task.status,
        projectName: task.projectName,
      });
    }
  }

  const userIds = [...new Set(rows.map((row) => Number(row.userId)))];
  const plannedTasksByRecord = new Map<string, DailyCheckinExportTask[]>();
  for (const batch of chunks(userIds, 500)) {
    const [plannedRows] = await pool.query<TaskExportRow[]>(
      `SELECT DATE_FORMAT(dct.checkin_date, '%Y-%m-%d') AS checkinDate,
              dct.user_id AS userId, t.id, t.task_code AS taskCode, t.title, t.status,
              p.name AS projectName
       FROM daily_checkin_tasks dct
       JOIN tasks t ON t.id = dct.task_id
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE dct.checkin_date BETWEEN ? AND ?
         AND dct.user_id IN (${batch.map(() => '?').join(',')})
       ORDER BY dct.checkin_date, dct.user_id, dct.position, t.id`,
      [filters.fromDate, filters.toDate, ...batch],
    );
    for (const task of plannedRows) {
      const key = `${task.checkinDate}:${Number(task.userId)}`;
      const list = plannedTasksByRecord.get(key) ?? [];
      list.push({
        id: Number(task.id),
        taskCode: task.taskCode,
        title: task.title,
        status: task.status,
        projectName: task.projectName,
      });
      plannedTasksByRecord.set(key, list);
    }
  }

  return rows.map((row, index) => {
    const userId = Number(row.userId);
    const hasCheckin = row.checkinId !== null;
    const isComplete = Boolean(row.isComplete);
    const hasBlocker = row.blockerStatus === 'BLOCKED';
    return {
      date: row.checkinDate,
      user: {
        userId,
        name: row.name,
        employeeCode: row.employeeCode,
        jobTitle: row.jobTitle,
        department: row.department,
      },
      submissionStatus: isComplete ? 'Submitted' : 'Pending',
      checkin: hasCheckin ? {
        submissionStatus: isComplete ? 'Submitted' : 'Pending',
        isComplete,
        reviewConfirmed: Boolean(row.reviewConfirmed),
        planConfirmed: Boolean(row.planConfirmed),
        blockerStatus: row.blockerStatus,
        blockerDescription: row.blockerDescription,
        blockerImpact: row.blockerImpact,
        completedAt: row.completedAt,
        savedAt: row.savedAt,
      } : null,
      reviewedTasks: reviewedIdsByRecord[index].map((id) =>
        taskById.get(id) ?? { id, taskCode: null, title: null, status: null, projectName: null }),
      plannedTasks: plannedTasksByRecord.get(`${row.checkinDate}:${userId}`) ?? [],
      hasBlocker,
    };
  });
}
