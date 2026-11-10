import cron from 'node-cron';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
import {
  isExcludedNotificationDate,
  runDailyTaskReminderJob,
  runInactiveTaskUpdateJob,
} from '../services/scheduledNotificationService';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';

interface MySqlLockRow extends RowDataPacket {
  acquired: number | null;
}

function getLocalDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

async function withDistributedLock(jobName: string, job: () => Promise<void>): Promise<void> {
  const connection = await pool.getConnection();
  const lockName = `tomohub:${jobName}`;
  let acquired = false;
  try {
    const [rows] = await connection.query<MySqlLockRow[]>(
      'SELECT GET_LOCK(?, 0) AS acquired',
      [lockName],
    );
    acquired = Number(rows[0]?.acquired) === 1;
    if (!acquired) {
      console.warn('[Notification cron] skipped because another process holds the job lock', JSON.stringify({ jobName }));
      return;
    }
    await job();
  } finally {
    if (acquired) {
      try {
        await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
      } catch (error) {
        console.error('[Notification cron] failed to release job lock', JSON.stringify({
          jobName,
          errorType: error instanceof Error ? error.name : 'unknown',
        }));
      }
    }
    connection.release();
  }
}

async function runOnBusinessDay(jobName: string, job: () => Promise<void>): Promise<void> {
  const date = getLocalDate(new Date());
  if (isExcludedNotificationDate(date)) {
    console.info('[Notification cron] skipped excluded date', JSON.stringify({ jobName, date, timeZone: TIME_ZONE }));
    return;
  }
  try {
    await withDistributedLock(jobName, job);
  } catch (error) {
    console.error('[Notification cron] scheduled job failed', JSON.stringify({
      jobName,
      date,
      errorType: error instanceof Error ? error.name : 'unknown',
      errorCode: typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code).slice(0, 100)
        : undefined,
    }));
  }
}

export function startNotificationCronJobs(): void {
  cron.schedule('0 9 * * *', () => runOnBusinessDay('daily-task-reminder', runDailyTaskReminderJob), {
    name: 'daily-task-reminder',
    timezone: TIME_ZONE,
    noOverlap: true,
  });
  cron.schedule('30 9 * * *', () => runOnBusinessDay('daily-inactivity-reminder', runInactiveTaskUpdateJob), {
    name: 'daily-inactivity-reminder',
    timezone: TIME_ZONE,
    noOverlap: true,
  });
  console.info('[Notification cron] scheduled daily jobs', JSON.stringify({
    timezone: TIME_ZONE,
    dailyReminder: '09:00',
    inactivityReminder: '09:30',
    excludedDays: 'Sundays and the last two Saturdays of each month',
  }));
}
