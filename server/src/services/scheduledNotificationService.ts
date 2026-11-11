import { randomUUID } from 'node:crypto';
import { sendNotificationToCheckin } from './checkinService';
import {
  findNotificationRecipients,
  saveNotificationHistory,
} from '../repositories/notificationRepository';
import { HttpError } from '../middleware/errorHandler';
import {
  listDailyTaskReminders,
  listDevelopmentDepartmentUsersWithoutActiveTasks,
  listUsersWithoutTaskActivityToday,
  type DailyTaskReminder,
} from '../repositories/notificationJobRepository';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MAX_RECIPIENTS_PER_SEND = 50;

interface LocalDateTime {
  date: string;
  dateTime: string;
}

function getLocalDateTime(value: Date): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const date = `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
  return {
    date,
    dateTime: `${date} ${values.get('hour')}:${values.get('minute')}:${values.get('second')}`,
  };
}

function nextLocalDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function reminderBody(reminder: DailyTaskReminder): string {
  const items = [
    reminder.overdueCount > 0 ? `${reminder.overdueCount} công việc quá hạn` : '',
    reminder.dueSoonCount > 0 ? `${reminder.dueSoonCount} công việc đến hạn hôm nay hoặc ngày mai` : '',
    reminder.newlyAssignedCount > 0 ? `${reminder.newlyAssignedCount} công việc mới được giao` : '',
  ].filter(Boolean);
  return `Bạn có ${items.join(', ')}. Vui lòng kiểm tra và cập nhật trạng thái công việc.`;
}

async function sendToPartnerUsers(
  partnerUserIds: number[],
  title: string,
  body: string,
  source: 'CRON_DAILY' | 'CRON_INACTIVITY' | 'CRON_NO_TASK',
  data: Record<string, string>,
): Promise<void> {
  for (let offset = 0; offset < partnerUserIds.length; offset += MAX_RECIPIENTS_PER_SEND) {
    const userIds = partnerUserIds.slice(offset, offset + MAX_RECIPIENTS_PER_SEND);
    const requestId = randomUUID();
    const recipients = await findNotificationRecipients(userIds);
    const byPartnerUserId = new Set(recipients.map((recipient) => Number(recipient.partner_user_id)));
    if (recipients.length !== userIds.length || userIds.some((id) => !byPartnerUserId.has(id))) {
      console.error('[Notification cron] skipped invalid recipient batch', JSON.stringify({
        source,
        requestId,
        requested: userIds.length,
        eligible: recipients.length,
      }));
      continue;
    }

    let deliveryStatus: 'RECORDED' | 'FAILED' = 'RECORDED';
    let errorCode: string | null = null;
    try {
      await sendNotificationToCheckin({ userIds, title, body, data });
      console.info('[Notification cron] Checkin accepted notification batch', JSON.stringify({
        source,
        requested: userIds.length,
        requestId,
      }));
    } catch (error) {
      deliveryStatus = 'FAILED';
      errorCode = error instanceof HttpError
        ? `CHECKIN_HTTP_${error.status}`
        : error instanceof Error
          ? error.name.slice(0, 100)
          : 'CHECKIN_REQUEST_FAILED';
      console.error('[Notification cron] Checkin notification request failed', JSON.stringify({
        source,
        requested: userIds.length,
        requestId,
        errorCode,
      }));
    }

    try {
      await saveNotificationHistory(recipients.map((recipient) => ({
        requestId,
        userId: recipient.id,
        partnerUserId: Number(recipient.partner_user_id),
        initiatedByUserId: null,
        source,
        title,
        body,
        data,
        deliveryStatus,
        deviceCount: 0,
        acceptedDeviceCount: 0,
        errorCode,
      })));
    } catch (error) {
      console.error('[Notification cron] failed to persist Checkin delivery history', JSON.stringify({
        source,
        requestId,
        errorType: error instanceof Error ? error.name : 'unknown',
      }));
      throw error;
    }
  }
}

export async function runDailyTaskReminderJob(now = new Date()): Promise<void> {
  const localNow = getLocalDateTime(now);
  const startOfDay = `${localNow.date} 00:00:00`;
  const startOfNextDay = `${nextLocalDate(localNow.date)} 00:00:00`;
  const reminders = await listDailyTaskReminders(localNow.date, startOfDay, startOfNextDay);

  const groups = new Map<string, { body: string; userIds: number[] }>();
  for (const reminder of reminders) {
    const body = reminderBody(reminder);
    const group = groups.get(body) ?? { body, userIds: [] };
    group.userIds.push(reminder.partnerUserId);
    groups.set(body, group);
  }

  console.info('[Notification cron] daily reminder scan completed', JSON.stringify({
    date: localNow.date,
    recipientCount: reminders.length,
    messageGroups: groups.size,
  }));
  for (const group of groups.values()) {
    await sendToPartnerUsers(
      group.userIds,
      'Nhắc nhở công việc',
      group.body,
      'CRON_DAILY',
      { type: 'GENERAL_NOTIFICATION', screen: 'HOME' },
    );
  }
}

export async function runInactiveTaskUpdateJob(now = new Date()): Promise<void> {
  const localNow = getLocalDateTime(now);
  const startOfDay = `${localNow.date} 00:00:00`;
  const inactiveUsers = await listUsersWithoutTaskActivityToday(startOfDay, localNow.dateTime);
  const partnerUserIds = inactiveUsers.map((user) => user.partnerUserId);

  console.info('[Notification cron] inactivity scan completed', JSON.stringify({
    date: localNow.date,
    recipientCount: partnerUserIds.length,
  }));
  await sendToPartnerUsers(
    partnerUserIds,
    'Nhắc cập nhật trạng thái công việc',
    'Bạn chưa có hoạt động cập nhật công việc trong ngày hôm nay. Vui lòng kiểm tra và cập nhật trạng thái các công việc được giao.',
    'CRON_INACTIVITY',
    { type: 'GENERAL_NOTIFICATION', screen: 'HOME' },
  );
}

export async function runDevelopmentDepartmentNoTaskJob(): Promise<void> {
  const employees = await listDevelopmentDepartmentUsersWithoutActiveTasks();
  const partnerUserIds = employees.map((employee) => employee.partnerUserId);

  console.info('[Notification cron] development department no-task scan completed', JSON.stringify({
    department: 'DEVELOPMENT DEPARTMENT',
    recipientCount: partnerUserIds.length,
  }));
  await sendToPartnerUsers(
    partnerUserIds,
    'Nhắc nhở công việc',
    'Hiện bạn chưa được giao công việc nào đang thực hiện. Vui lòng liên hệ quản lý nhóm để được phân công công việc.',
    'CRON_NO_TASK',
    { type: 'GENERAL_NOTIFICATION', screen: 'HOME' },
  );
}

export function isExcludedNotificationDate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('Date must be in YYYY-MM-DD format');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dateValue = new Date(Date.UTC(year, month - 1, day));
  if (
    dateValue.getUTCFullYear() !== year ||
    dateValue.getUTCMonth() !== month - 1 ||
    dateValue.getUTCDate() !== day
  ) {
    throw new Error('Date must be a valid calendar date');
  }

  const weekday = dateValue.getUTCDay();
  if (weekday === 0) return true;
  if (weekday !== 6) return false;

  const lastDay = new Date(Date.UTC(year, month, 0));
  const lastSaturdayDay = lastDay.getUTCDate() - ((lastDay.getUTCDay() + 1) % 7);
  return day === lastSaturdayDay || day === lastSaturdayDay - 7;
}
