import { applicationDefault, cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { HttpError } from '../middleware/errorHandler';
import {
  deleteInvalidFcmTokens,
  getNotificationHistory,
  findNotificationRecipients,
  getBoundFcmTokens,
  listMirroredEmployees,
  listNotificationRecipients,
  saveNotificationHistory,
  type BoundFcmToken,
} from '../repositories/notificationRepository';

const MAX_INPUT_IDS = 50;
const MAX_FCM_TOKENS_PER_REQUEST = 500;
const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

export interface SendNotificationInput {
  userIds: number[];
  title: string;
  body: string;
  data: Record<string, string>;
}

function getMessagingClient(): Messaging {
  const existing = getApps().find((app) => app.name === 'tomohub-notifications');
  if (existing) return getMessaging(existing);

  let credential;
  if (env.firebase.serviceAccountJson) {
    let parsed: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(env.firebase.serviceAccountJson);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Expected service account object');
      }
      parsed = value as Record<string, unknown>;
    } catch {
      throw new HttpError(503, 'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
    const projectId = parsed.project_id;
    const clientEmail = parsed.client_email;
    const privateKey = parsed.private_key;
    if (
      typeof projectId !== 'string' ||
      typeof clientEmail !== 'string' ||
      typeof privateKey !== 'string'
    ) {
      throw new HttpError(503, 'Firebase service account is missing project_id, client_email, or private_key');
    }
    const serviceAccount: ServiceAccount = {
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    };
    credential = cert(serviceAccount);
  } else {
    credential = applicationDefault();
  }

  const app = initializeApp(
    {
      credential,
      ...(env.firebase.projectId ? { projectId: env.firebase.projectId } : {}),
    },
    'tomohub-notifications',
  );
  return getMessaging(app);
}

export function parseSendNotificationInput(value: unknown): SendNotificationInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be an object');
  }
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.userIds) || body.userIds.length === 0 || body.userIds.length > MAX_INPUT_IDS) {
    throw new HttpError(400, `userIds must contain between 1 and ${MAX_INPUT_IDS} IDs`);
  }
  if (!body.userIds.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) {
    throw new HttpError(400, 'Every userId must be a positive integer partner_user_id');
  }
  const userIds = [...new Set(body.userIds as number[])];

  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 255) {
    throw new HttpError(400, 'title is required and must be at most 255 characters');
  }
  if (typeof body.body !== 'string' || !body.body.trim() || body.body.length > 4000) {
    throw new HttpError(400, 'body is required and must be at most 4000 characters');
  }

  const data: Record<string, string> = {};
  if (body.data !== undefined) {
    if (typeof body.data !== 'object' || body.data === null || Array.isArray(body.data)) {
      throw new HttpError(400, 'data must be an object of scalar values');
    }
    for (const [key, item] of Object.entries(body.data)) {
      if (!key || key.length > 128 || !['string', 'number', 'boolean'].includes(typeof item)) {
        throw new HttpError(400, 'data keys and values must be valid FCM scalar values');
      }
      data[key] = String(item);
    }
  }

  return { userIds, title: body.title.trim(), body: body.body.trim(), data };
}

function recipientError(): HttpError {
  return new HttpError(
    400,
    'One or more partner_user_id values are unknown, inactive, deleted, terminated, or not eligible',
    'INVALID_NOTIFICATION_RECIPIENTS',
  );
}

export async function recordPartnerNotification(input: SendNotificationInput) {
  const requestId = randomUUID();
  console.info('[Notification] partner request received', JSON.stringify({
    requestId,
    recipientCount: input.userIds.length,
    titleLength: input.title.length,
    bodyLength: input.body.length,
    dataKeys: Object.keys(input.data),
  }));

  const recipients = await findNotificationRecipients(input.userIds);
  const recipientIds = new Set(recipients.map((recipient) => Number(recipient.partner_user_id)));
  if (recipientIds.size !== input.userIds.length || input.userIds.some((id) => !recipientIds.has(id))) {
    console.warn('[Notification] partner recipient validation failed', JSON.stringify({
      requestId,
      requestedCount: input.userIds.length,
      eligibleCount: recipientIds.size,
    }));
    throw recipientError();
  }

  await saveNotificationHistory(recipients.map((recipient) => ({
    requestId,
    userId: recipient.id,
    partnerUserId: Number(recipient.partner_user_id),
    initiatedByUserId: null,
    source: 'PARTNER',
    title: input.title,
    body: input.body,
    data: input.data,
    deliveryStatus: 'RECORDED',
    deviceCount: 0,
    acceptedDeviceCount: 0,
    errorCode: null,
  })));

  console.info('[Notification] partner request recorded without FCM delivery', JSON.stringify({
    requestId,
    recipientCount: recipients.length,
  }));
  return {
    requestId,
    accepted: recipients.length,
    recorded: recipients.length,
    sent: 0,
    failed: 0,
  };
}

export async function sendPartnerNotification(
  input: SendNotificationInput,
  initiatedByUserId: number | null = null,
  source: 'PARTNER' | 'ADMIN' | 'CRON_DAILY' | 'CRON_INACTIVITY' | 'SYSTEM' =
    initiatedByUserId === null ? 'PARTNER' : 'ADMIN',
) {
  const requestId = randomUUID();
  console.info('[Notification] request received', JSON.stringify({
    requestId,
    source,
    recipientCount: input.userIds.length,
    titleLength: input.title.length,
    bodyLength: input.body.length,
    dataKeys: Object.keys(input.data),
  }));

  const recipients = await findNotificationRecipients(input.userIds);
  const recipientIds = new Set(recipients.map((recipient) => Number(recipient.partner_user_id)));
  if (recipientIds.size !== input.userIds.length || input.userIds.some((id) => !recipientIds.has(id))) {
    console.warn('[Notification] recipient validation failed', JSON.stringify({
      requestId,
      requestedCount: input.userIds.length,
      eligibleCount: recipientIds.size,
    }));
    throw recipientError();
  }

  console.info('[Notification] recipients validated', JSON.stringify({
    requestId,
    recipientCount: recipients.length,
  }));

  const tokens = await getBoundFcmTokens(recipients.map((recipient) => recipient.id));
  console.info('[Notification] bound device tokens loaded', JSON.stringify({
    requestId,
    recipientCount: recipients.length,
    tokenCount: tokens.length,
    recipientsWithoutTokens: recipients.length - new Set(tokens.map((token) => token.user_id)).size,
  }));
  const tokensByUser = new Map<number, BoundFcmToken[]>();
  for (const token of tokens) {
    const items = tokensByUser.get(token.user_id) ?? [];
    items.push(token);
    tokensByUser.set(token.user_id, items);
  }

  const acceptedTokens = new Set<number>();
  const tokenErrorCodes = new Map<number, string>();
  const invalidTokenIds: number[] = [];
  let providerErrorCode: string | null = null;
  const hasTokens = tokens.length > 0;
  const tokenFailureCounts = new Map<string, number>();
  if (hasTokens) {
    try {
      const messaging = getMessagingClient();
      let batchNumber = 0;
      for (let offset = 0; offset < tokens.length; offset += MAX_FCM_TOKENS_PER_REQUEST) {
        const batch = tokens.slice(offset, offset + MAX_FCM_TOKENS_PER_REQUEST);
        batchNumber += 1;
        console.info('[Notification] sending FCM batch', JSON.stringify({
          requestId,
          batchNumber,
          tokenCount: batch.length,
        }));
        const result = await messaging.sendEachForMulticast({
          tokens: batch.map((token) => token.fcm_token),
          notification: { title: input.title, body: input.body },
          ...(Object.keys(input.data).length > 0 ? { data: input.data } : {}),
        });
        result.responses.forEach((response, index) => {
          const token = batch[index];
          if (response.success) {
            acceptedTokens.add(token.id);
            return;
          }
          const code = response.error?.code ?? 'messaging/unknown-error';
          tokenErrorCodes.set(token.id, code);
          tokenFailureCounts.set(code, (tokenFailureCounts.get(code) ?? 0) + 1);
          if (INVALID_TOKEN_CODES.has(code)) invalidTokenIds.push(token.id);
        });
        console.info('[Notification] FCM batch completed', JSON.stringify({
          requestId,
          batchNumber,
          accepted: result.successCount,
          rejected: result.failureCount,
        }));
      }
    } catch (error) {
      const candidate = error as { code?: unknown };
      providerErrorCode = typeof candidate.code === 'string'
        ? candidate.code.slice(0, 100)
        : error instanceof HttpError && error.status === 503
          ? 'FIREBASE_CONFIGURATION_ERROR'
          : 'provider/unavailable';
      console.error('[Notification] FCM provider call failed', JSON.stringify({
        requestId,
        code: providerErrorCode,
        errorType: error instanceof Error ? error.name : 'unknown',
      }));
    }
  } else {
    console.warn('[Notification] no bound FCM tokens found', JSON.stringify({
      requestId,
      recipientCount: recipients.length,
    }));
  }

  const history = recipients.map((recipient) => {
    const userTokens = tokensByUser.get(recipient.id) ?? [];
    const acceptedCount = userTokens.filter((token) => acceptedTokens.has(token.id)).length;
    const failed = acceptedCount === 0;
    const errorCode = failed
      ? providerErrorCode ??
        userTokens.map((token) => tokenErrorCodes.get(token.id)).find(Boolean) ??
        (userTokens.length === 0 ? 'missing_fcm_token' : 'provider/failed')
      : null;
    return {
      requestId,
      userId: recipient.id,
      partnerUserId: Number(recipient.partner_user_id),
      initiatedByUserId,
      source,
      title: input.title,
      body: input.body,
      data: input.data,
      deliveryStatus: failed ? 'FAILED' as const : 'SENT' as const,
      deviceCount: userTokens.length,
      acceptedDeviceCount: acceptedCount,
      errorCode,
    };
  });
  try {
    await saveNotificationHistory(history);
    console.info('[Notification] delivery history saved', JSON.stringify({
      requestId,
      recipientCount: history.length,
      sent: history.filter((item) => item.deliveryStatus === 'SENT').length,
      failed: history.filter((item) => item.deliveryStatus === 'FAILED').length,
    }));
  } catch (error) {
    const candidate = error as { code?: unknown };
    console.error('[Notification] failed to persist delivery history', JSON.stringify({
      requestId,
      code: typeof candidate.code === 'string' ? candidate.code : 'database/error',
      errorType: error instanceof Error ? error.name : 'unknown',
    }));
    throw error;
  }
  let invalidTokensRemoved = 0;
  try {
    await deleteInvalidFcmTokens(invalidTokenIds);
    invalidTokensRemoved = invalidTokenIds.length;
  } catch (error) {
    const candidate = error as { code?: unknown };
    console.error(
      '[FCM cleanup] failed to remove invalid tokens',
      JSON.stringify({ code: typeof candidate.code === 'string' ? candidate.code : 'database/error' }),
    );
  }

  const sent = history.filter((item) => item.deliveryStatus === 'SENT').length;
  const failureReasons = new Map<string, number>();
  for (const item of history) {
    if (item.deliveryStatus === 'FAILED' && item.errorCode) {
      failureReasons.set(item.errorCode, (failureReasons.get(item.errorCode) ?? 0) + 1);
    }
  }
  const summary = {
    requestId,
    sent,
    failed: history.length - sent,
    sentDevices: acceptedTokens.size,
    failedDevices: tokens.length - acceptedTokens.size,
    invalidTokensRemoved,
    failureReasons: [...failureReasons].map(([code, recipients]) => ({ code, recipients })),
  };
  console.info('[Notification] request completed', JSON.stringify({
    ...summary,
    tokenFailureCounts: Object.fromEntries(tokenFailureCounts),
  }));
  return {
    ...summary,
  };
}

export async function getAdminNotificationRecipients() {
  const rows = await listNotificationRecipients();
  return rows.map((row) => ({
    partnerUserId: Number(row.partner_user_id),
    name: row.name,
    email: row.email,
    jobTitle: row.job_title,
    department: row.department,
  }));
}

export async function getAdminMirroredEmployees() {
  const rows = await listMirroredEmployees();
  return rows.map((row) => ({
    partnerUserId: Number(row.partner_user_id),
    name: row.name,
    email: row.email,
    jobTitle: row.job_title,
    department: row.department,
    status: row.partner_status ?? (row.is_active ? 'ACTIVE' : 'INACTIVE'),
    isActive: Boolean(row.is_active),
    isSystemAccount: Boolean(row.is_acc_admin) || row.role === 'admin',
  }));
}

export async function getAdminNotificationHistory(page: number, limit: number, search: string) {
  const result = await getNotificationHistory({
    offset: (page - 1) * limit,
    limit,
    search,
  });
  return {
    data: result.rows.map((row) => ({
      requestId: row.request_id,
      title: row.title,
      body: row.body,
      sent: Number(row.sent),
      recorded: Number(row.recorded),
      failed: Number(row.failed),
      initiatedBy: row.initiated_by ?? 'Đối tác / hệ thống',
      createdAt: row.created_at,
    })),
    total: result.total,
    page,
    limit,
  };
}
