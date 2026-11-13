import type { Task } from '../types';
import { findEligiblePartnerUserIdsForUsers } from '../repositories/notificationRepository';
import { sendPartnerNotification } from './notificationService';

const TASK_NOTIFICATION_TITLE = 'Task có thay đổi';
const TASK_STATUS_LABELS: Record<Task['status'], string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'Đang thực hiện',
  DEV_DONE: 'Hoàn thành phát triển',
  TESTING: 'Đang kiểm thử',
  TEST_FAIL: 'Kiểm thử thất bại',
  REVIEW: 'Đang review',
  DONE: 'Đã hoàn thành',
  GOLIVE: 'Golive',
  PENDING: 'Tạm dừng',
};

function assigneeIds(task: Task): number[] {
  return [...new Set([
    ...task.assigneeIds,
    ...(task.assigneeId === null ? [] : [task.assigneeId]),
  ])];
}

function formatDueDate(value: string | null): string {
  if (!value) return 'đã được gỡ';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function taskNotificationData(task: Task) {
  return {
    type: 'TASK_NOTIFICATION',
    screen: 'TASK_DETAIL',
    taskId: String(task.id),
    taskCode: task.taskCode,
  };
}

async function sendTaskNotification(
  task: Task,
  recipientIds: number[],
  body: string,
  actorId: number,
  actorIsAdmin: boolean,
): Promise<void> {
  const recipients = recipientIds.filter((id) => actorIsAdmin || id !== actorId);
  if (recipients.length === 0) return;

  try {
    const partnerUserIds = await findEligiblePartnerUserIdsForUsers(recipients);
    if (partnerUserIds.length === 0) return;
    await sendPartnerNotification(
      {
        userIds: partnerUserIds,
        title: TASK_NOTIFICATION_TITLE,
        body,
        data: taskNotificationData(task),
      },
      actorId,
      'SYSTEM',
    );
  } catch (error) {
    console.error('[Task notification] delivery failed', JSON.stringify({
      taskId: task.id,
      recipientCount: recipients.length,
      errorType: error instanceof Error ? error.name : 'unknown',
    }));
  }
}

export async function notifyTaskCreated(
  task: Task,
  actorId: number,
  actorIsAdmin: boolean,
): Promise<void> {
  const body = `Bạn vừa được giao công việc mới: ${task.taskCode} - ${task.title}. Hãy kiểm tra và cập nhật tiến độ.`;
  await sendTaskNotification(task, assigneeIds(task), body, actorId, actorIsAdmin);
}

export async function notifyTaskUpdated(
  previous: Task,
  current: Task,
  actorId: number,
  actorIsAdmin: boolean,
): Promise<void> {
  const previousAssignees = assigneeIds(previous);
  const currentAssignees = assigneeIds(current);
  const previousAssigneeSet = new Set(previousAssignees);
  const newlyAssigned = currentAssignees.filter((id) => !previousAssigneeSet.has(id));

  const title = `${current.taskCode} - ${current.title}`;
  if (newlyAssigned.length > 0) {
    const body = `Bạn vừa được giao công việc mới: ${title}. Hãy kiểm tra và cập nhật tiến độ.`;
    await sendTaskNotification(current, newlyAssigned, body, actorId, actorIsAdmin);
  }

  const importantFieldsChanged =
    previous.status !== current.status ||
    previous.startDate !== current.startDate ||
    previous.dueDate !== current.dueDate ||
    previous.priority !== current.priority ||
    previous.description !== current.description ||
    previous.title !== current.title;
  if (!importantFieldsChanged) return;

  let body: string;
  if (previous.status !== current.status) {
    body = `Công việc ${title} vừa được chuyển sang trạng thái ${TASK_STATUS_LABELS[current.status]}.`;
  } else if (previous.dueDate !== current.dueDate) {
    body = `Thời hạn của công việc ${title} vừa được cập nhật thành ${formatDueDate(current.dueDate)}.`;
  } else {
    body = `Công việc ${title} bạn đang phụ trách vừa có cập nhật mới.`;
  }

  const continuingAssignees = currentAssignees.filter((id) => previousAssigneeSet.has(id));
  await sendTaskNotification(current, continuingAssignees, body, actorId, actorIsAdmin);
}
