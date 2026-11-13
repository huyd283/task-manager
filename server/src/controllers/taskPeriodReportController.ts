import type { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
import { HttpError } from '../middleware/errorHandler';
import {
  listPeriodReportAssignments,
  listPeriodReportTasks,
  type PeriodReportTask,
} from '../repositories/taskPeriodReportRepository';
import type { TaskStatus } from '../types';

type ReportPeriod = 'week' | 'month' | 'custom';

interface DateRange {
  period: ReportPeriod;
  startDate: string;
  endDate: string;
}

interface ReportEmployee {
  userId: number;
  name: string;
  department: string;
  assigned: number;
  completed: number;
  overdue: number;
}

interface ReportTask {
  id: number;
  taskCode: string;
  title: string;
  assignees: string;
  departments: string;
  status: TaskStatus;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  assignedInPeriod: boolean;
  completedInPeriod: boolean;
  currentlyOverdue: boolean;
  overdueInPeriod: boolean;
}

function parseDate(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `${name} must be a valid YYYY-MM-DD date`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${name} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

function dateToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function resolveDateRange(query: Request['query']): DateRange {
  const period = query.period;
  if (period !== 'week' && period !== 'month' && period !== 'custom') {
    throw new HttpError(400, "period must be 'week', 'month', or 'custom'");
  }

  if (period === 'custom') {
    const startDate = parseDate(query.startDate, 'startDate');
    const endDate = parseDate(query.endDate, 'endDate');
    const days = (dateToUtc(endDate).getTime() - dateToUtc(startDate).getTime()) / 86_400_000;
    if (days < 0) throw new HttpError(400, 'endDate must not be earlier than startDate');
    if (days > 365) throw new HttpError(400, 'Custom report range must not exceed 366 days');
    return { period, startDate, endDate };
  }

  const referenceDate = query.startDate === undefined
    ? new Date()
    : dateToUtc(parseDate(query.startDate, 'startDate'));

  if (period === 'week') {
    const start = new Date(Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
    ));
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const startDate = toIsoDate(start);
    const endDate = toIsoDate(end);
    if (query.endDate !== undefined && parseDate(query.endDate, 'endDate') !== endDate) {
      throw new HttpError(400, 'endDate must be the Sunday of the selected week');
    }
    return { period, startDate, endDate };
  }

  const start = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 0));
  const startDate = toIsoDate(start);
  const endDate = toIsoDate(end);
  if (query.endDate !== undefined && parseDate(query.endDate, 'endDate') !== endDate) {
    throw new HttpError(400, 'endDate must be the last day of the selected month');
  }
  return { period, startDate, endDate };
}

async function reportDepartmentForUser(userId: number): Promise<{ isAdmin: boolean; department: string | null }> {
  const [rows] = await pool.query<Array<RowDataPacket & {
    role: string;
    is_acc_admin: number;
    job_title: string;
    department: string | null;
  }>>(
    'SELECT role, is_acc_admin, job_title, department FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
    [userId],
  );
  const user = rows[0];
  if (!user) throw new HttpError(401, 'Authenticated user no longer exists');
  const isAdmin = user.role === 'admin' || Boolean(user.is_acc_admin);
  if (isAdmin) return { isAdmin: true, department: null };
  if (user.job_title !== 'Project Lead') {
    throw new HttpError(403, 'Only administrators and department leads can view time reports');
  }
  if (!user.department?.trim()) {
    throw new HttpError(403, 'A department must be assigned to your account to view this report');
  }
  return { isAdmin: false, department: user.department };
}

function mapReportTask(
  row: PeriodReportTask,
  range: DateRange,
  assignees: Array<{ name: string; department: string | null }>,
): ReportTask {
  const createdDate = String(row.createdAt).slice(0, 10);
  const completedDate = row.completedAt ? String(row.completedAt).slice(0, 10) : null;
  const dueDate = row.dueDate ? String(row.dueDate).slice(0, 10) : null;
  const assignedInPeriod = assignees.length > 0 &&
    createdDate >= range.startDate && createdDate <= range.endDate;
  const completedInPeriod = completedDate !== null &&
    completedDate >= range.startDate && completedDate <= range.endDate;
  const overdueInPeriod = Boolean(row.currentlyOverdue) && dueDate !== null &&
    dueDate >= range.startDate && dueDate <= range.endDate;
  return {
    id: Number(row.id),
    taskCode: row.taskCode,
    title: row.title,
    assignees: [...new Set(assignees.map((assignee) => assignee.name))]
      .sort((a, b) => a.localeCompare(b, 'vi')).join(', '),
    departments: [...new Set(assignees.map((assignee) => assignee.department).filter(
      (value): value is string => Boolean(value),
    ))].sort((a, b) => a.localeCompare(b, 'vi')).join(', '),
    status: row.status as TaskStatus,
    priority: row.priority,
    startDate: row.startDate ? String(row.startDate).slice(0, 10) : null,
    dueDate,
    createdAt: String(row.createdAt),
    completedAt: completedDate,
    assignedInPeriod,
    completedInPeriod,
    currentlyOverdue: Boolean(row.currentlyOverdue),
    overdueInPeriod,
  };
}

function buildReport(
  range: DateRange,
  department: string | null,
  rows: PeriodReportTask[],
  assignments: Array<{ taskId: number; userId: number; name: string; department: string | null }>,
) {
  const assignmentMap = new Map<number, Array<{ name: string; department: string | null }>>();
  assignments.forEach((assignment) => {
    const taskId = Number(assignment.taskId);
    const taskAssignees = assignmentMap.get(taskId) ?? [];
    taskAssignees.push({ name: assignment.name, department: assignment.department });
    assignmentMap.set(taskId, taskAssignees);
  });
  const tasks = rows.map((row) => mapReportTask(row, range, assignmentMap.get(Number(row.id)) ?? []));
  const employees = new Map<number, ReportEmployee>();
  const taskMetrics = new Map(tasks.map((task) => [task.id, task]));
  const departmentMetrics = new Map<string, {
    department: string;
    assigned: Set<number>;
    completed: Set<number>;
    overdue: Set<number>;
  }>();

  assignments.forEach((assignment) => {
    const task = taskMetrics.get(Number(assignment.taskId));
    if (!task) return;
    const current = employees.get(Number(assignment.userId)) ?? {
      userId: Number(assignment.userId),
      name: assignment.name,
      department: assignment.department ?? '',
      assigned: 0,
      completed: 0,
      overdue: 0,
    };
    if (task.assignedInPeriod) current.assigned += 1;
    if (task.completedInPeriod) current.completed += 1;
    if (task.overdueInPeriod) current.overdue += 1;
    employees.set(current.userId, current);

    const departmentName = assignment.department ?? 'Chưa phân phòng ban';
    const departmentReport = departmentMetrics.get(departmentName) ?? {
      department: departmentName,
      assigned: new Set<number>(),
      completed: new Set<number>(),
      overdue: new Set<number>(),
    };
    if (task.assignedInPeriod) departmentReport.assigned.add(task.id);
    if (task.completedInPeriod) departmentReport.completed.add(task.id);
    if (task.overdueInPeriod) departmentReport.overdue.add(task.id);
    departmentMetrics.set(departmentName, departmentReport);
  });

  const employeeList = [...employees.values()].sort((a, b) =>
    a.department.localeCompare(b.department, 'vi') || a.name.localeCompare(b.name, 'vi'),
  );
  const departmentList = [...departmentMetrics.values()]
    .map((item) => ({
      department: item.department,
      assigned: item.assigned.size,
      completed: item.completed.size,
      overdue: item.overdue.size,
    }))
    .sort((a, b) => a.department.localeCompare(b.department, 'vi'));

  return {
    period: range.period,
    startDate: range.startDate,
    endDate: range.endDate,
    scope: department ? 'department' : 'company',
    department,
    summary: {
      assigned: tasks.filter((task) => task.assignedInPeriod).length,
      completed: tasks.filter((task) => task.completedInPeriod).length,
      overdue: tasks.filter((task) => task.overdueInPeriod).length,
      inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
      taskCount: tasks.length,
    },
    byDepartment: departmentList,
    byEmployee: employeeList,
    tasks,
  };
}

async function loadReport(req: Request) {
  const range = resolveDateRange(req.query);
  const access = await reportDepartmentForUser(req.user!.id);
  const [rows, assignments] = await Promise.all([
    listPeriodReportTasks(range.startDate, range.endDate, access.department),
    listPeriodReportAssignments(range.startDate, range.endDate, access.department),
  ]);
  return buildReport(range, access.department, rows, assignments);
}

export async function getTimeReport(req: Request, res: Response) {
  res.json({ data: await loadReport(req) });
}

export async function exportTimeReport(req: Request, res: Response) {
  const format = req.query.format;
  if (format !== 'xlsx') throw new HttpError(400, "format must be 'xlsx'");
  const report = await loadReport(req);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TomoHub';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Tổng quan');
  summary.columns = [
    { header: 'Chỉ số', key: 'metric', width: 32 },
    { header: 'Số lượng', key: 'value', width: 18 },
  ];
  summary.addRows([
    { metric: 'Phạm vi', value: report.department ?? 'Toàn công ty' },
    { metric: 'Từ ngày', value: report.startDate },
    { metric: 'Đến ngày', value: report.endDate },
    { metric: 'Task được giao trong kỳ', value: report.summary.assigned },
    { metric: 'Task hoàn thành trong kỳ', value: report.summary.completed },
    { metric: 'Task quá hạn trong kỳ', value: report.summary.overdue },
    { metric: 'Task đang thực hiện', value: report.summary.inProgress },
    { metric: 'Task trong danh sách chi tiết', value: report.summary.taskCount },
  ]);

  const employees = workbook.addWorksheet('Theo nhân sự');
  employees.columns = [
    { header: 'Nhân sự', key: 'name', width: 30 },
    { header: 'Phòng ban', key: 'department', width: 28 },
    { header: 'Được giao', key: 'assigned', width: 16 },
    { header: 'Hoàn thành', key: 'completed', width: 16 },
    { header: 'Quá hạn', key: 'overdue', width: 14 },
  ];
  employees.addRows(report.byEmployee);

  const departments = workbook.addWorksheet('Theo phòng ban');
  departments.columns = [
    { header: 'Phòng ban', key: 'department', width: 32 },
    { header: 'Được giao', key: 'assigned', width: 16 },
    { header: 'Hoàn thành', key: 'completed', width: 16 },
    { header: 'Quá hạn', key: 'overdue', width: 14 },
  ];
  departments.addRows(report.byDepartment);

  const taskSheet = workbook.addWorksheet('Chi tiết Task');
  taskSheet.columns = [
    { header: 'Mã Task', key: 'taskCode', width: 18 },
    { header: 'Tên Task', key: 'title', width: 42 },
    { header: 'Người thực hiện', key: 'assignees', width: 32 },
    { header: 'Phòng ban', key: 'departments', width: 28 },
    { header: 'Trạng thái', key: 'status', width: 18 },
    { header: 'Ưu tiên', key: 'priority', width: 14 },
    { header: 'Ngày bắt đầu', key: 'startDate', width: 16 },
    { header: 'Ngày kết thúc', key: 'dueDate', width: 16 },
    { header: 'Ngày tạo', key: 'createdAt', width: 22 },
    { header: 'Ngày hoàn thành', key: 'completedAt', width: 22 },
    { header: 'Giao trong kỳ', key: 'assignedInPeriod', width: 16 },
    { header: 'Hoàn thành trong kỳ', key: 'completedInPeriod', width: 20 },
    { header: 'Quá hạn trong kỳ', key: 'overdueInPeriod', width: 18 },
  ];
  taskSheet.addRows(report.tasks);

  for (const sheet of workbook.worksheets) {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    header.alignment = { vertical: 'middle' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `tomo-task-report-${report.startDate}-${report.endDate}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}
