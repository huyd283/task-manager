import { randomBytes } from 'node:crypto';
import { env } from '../config/env';
import { HttpError } from '../middleware/errorHandler';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_EMPLOYEE_PAGES = 10_000;
const EMPLOYEE_ENDPOINT = '/api/v1/internal/employees';
const NOTIFICATION_SEND_ENDPOINT = '/api/v1/internal/notifications/send';

export interface CheckinEmployee {
  userId: number;
  email: string;
  username: string | null;
  name: string;
  status: string;
  jobTitle: string | null;
  department: string | null;
  isAccAdmin: boolean;
}

export interface CheckinEmployeePageOptions {
  page: number;
  limit: number;
  updatedSince?: string;
}

interface CheckinAuthResult {
  verified: boolean;
  status: string;
  userId: number;
}

interface CheckinEmployeePage {
  employees: CheckinEmployee[];
  hasMore: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uuidV7(): string {
  const bytes = randomBytes(16);
  const timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number((timestamp >> BigInt((5 - index) * 8)) & 0xffn);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getEmployeesArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return null;
  for (const key of ['employees', 'items', 'records', 'content']) {
    if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  return null;
}

function isSystemAdmin(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function summarizeResponse(path: string, payload: unknown): unknown {
  if (!isRecord(payload)) {
    return { type: Array.isArray(payload) ? 'array' : typeof payload };
  }

  const summary: Record<string, unknown> = {};
  if ('status' in payload) summary.status = payload.status;
  if (typeof payload.message === 'string') summary.message = payload.message.slice(0, 300);

  if (path.endsWith('/employees')) {
    const employees = getEmployeesArray(payload.data);
    summary.data = employees ? { employeeCount: employees.length } : '[omitted]';
    const metadata = isRecord(payload.pagination)
      ? payload.pagination
      : isRecord(payload.meta)
        ? payload.meta
        : isRecord(payload.data)
          ? payload.data.pagination ?? payload.data.meta ?? payload.data
          : null;
    if (isRecord(metadata)) {
      summary.pagination = {
        ...(typeof metadata.page === 'number' ? { page: metadata.page } : {}),
        ...(typeof metadata.currentPage === 'number' ? { currentPage: metadata.currentPage } : {}),
        ...(typeof metadata.totalPages === 'number' ? { totalPages: metadata.totalPages } : {}),
        ...(typeof metadata.hasNext === 'boolean' ? { hasNext: metadata.hasNext } : {}),
        ...(typeof metadata.hasNextPage === 'boolean' ? { hasNextPage: metadata.hasNextPage } : {}),
      };
    }
  } else if (path.endsWith('/notifications/send') && isRecord(payload.data)) {
    summary.data = {
      ...(typeof payload.data.requested === 'number' ? { requested: payload.data.requested } : {}),
      ...(typeof payload.data.sent === 'number' ? { sent: payload.data.sent } : {}),
      ...(typeof payload.data.failed === 'number' ? { failed: payload.data.failed } : {}),
    };
  } else if (isRecord(payload.data)) {
    const { verified, status, userId } = payload.data;
    summary.data = {
      ...(typeof verified === 'boolean' ? { verified } : {}),
      ...(typeof status === 'string' ? { status } : {}),
      ...(typeof userId === 'number' ? { userId } : {}),
    };
  } else if ('data' in payload) {
    summary.data = '[omitted]';
  }

  return summary;
}

function logCheckinResponse(path: string, status: number, payload: unknown): void {
  const details = JSON.stringify({
    endpoint: path,
    httpStatus: status,
    response: summarizeResponse(path, payload),
  });
  if (status >= 400) {
    console.warn('[Checkin response]', details);
  } else {
    console.info('[Checkin response]', details);
  }
}

function getPartnerConfig(): { baseUrl: string; partnerCode: string; partnerToken: string } {
  const { baseUrl, partnerCode, partnerToken } = env.checkin;

  const missing = [
    !baseUrl && 'CHECKIN_BASE_URL',
    !partnerCode && 'CHECKIN_PARTNER_CODE',
    !partnerToken && 'CHECKIN_PARTNER_TOKEN',
  ].filter((key): key is string => Boolean(key));
  if (missing.length > 0) {
    throw new HttpError(503, `Checkin integration is not configured: missing ${missing.join(', ')}`);
  }
  try {
    const url = new URL(baseUrl);
    if (env.nodeEnv === 'production' && url.protocol !== 'https:') {
      throw new Error('Production Checkin URL must use HTTPS');
    }
  } catch {
    throw new HttpError(503, 'CHECKIN_BASE_URL must be a valid HTTPS URL in production');
  }
  return { baseUrl, partnerCode, partnerToken };
}

async function requestCheckin(
  path: string,
  init: RequestInit,
  options: { clientMessageId?: string; query?: URLSearchParams } = {},
): Promise<Record<string, unknown>> {
  const config = getPartnerConfig();
  const url = new URL(path, config.baseUrl);
  options.query?.forEach((value, key) => url.searchParams.set(key, value));
  let response: Response;
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Partner-Code': config.partnerCode,
      'X-Partner-Token': config.partnerToken,
      ...(options.clientMessageId ? { 'X-Client-Message-Id': options.clientMessageId } : {}),
    };
    response = await fetch(url, {
      ...init,
      headers: { ...headers, ...init.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, 'Checkin service is unavailable');
  }

  let payload: unknown;
  let validJson = true;
  try {
    const body = await response.text();
    payload = JSON.parse(body) as unknown;
  } catch {
    validJson = false;
    payload = null;
  }
  logCheckinResponse(path, response.status, payload);

  if (!response.ok) {
    if (path.endsWith('/auth/verify') && response.status === 400) {
      throw new HttpError(401, 'Tài khoản hoặc mật khẩu không chính xác');
    }
    throw new HttpError(502, `Checkin service returned HTTP ${response.status}`);
  }
  if (!validJson) {
    throw new HttpError(502, 'Checkin service returned invalid JSON');
  }
  if (!isRecord(payload) || payload.status !== 200 || !('data' in payload)) {
    throw new HttpError(502, 'Checkin service returned an unexpected response');
  }
  return payload;
}

function parseUserId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function verifyCheckinCredentials(username: string, password: string): Promise<CheckinAuthResult> {
  const payload = await requestCheckin('/api/v1/internal/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const data = payload.data;
  if (!isRecord(data) || typeof data.verified !== 'boolean' || typeof data.status !== 'string') {
    throw new HttpError(502, 'Checkin service returned an unexpected authentication response');
  }
  const userId = parseUserId(data.userId);
  if (userId === null) {
    throw new HttpError(502, 'Checkin service did not return a valid user ID');
  }
  const status = data.status.trim().toUpperCase();
  if (!status || status.length > 30) {
    throw new HttpError(502, 'Checkin service returned an invalid account status');
  }
  return { verified: data.verified, status, userId };
}

export async function sendNotificationToCheckin(input: {
  userIds: number[];
  title: string;
  body: string;
  data: Record<string, string>;
}): Promise<unknown> {
  const clientMessageId = uuidV7();
  console.info('[Checkin request]', JSON.stringify({
    method: 'POST',
    endpoint: NOTIFICATION_SEND_ENDPOINT,
    clientMessageId,
    recipientCount: input.userIds.length,
  }));
  const response = await requestCheckin(
    NOTIFICATION_SEND_ENDPOINT,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    { clientMessageId },
  );
  return response.data;
}

function parseEmployee(value: unknown): CheckinEmployee | null {
  if (!isRecord(value)) {
    throw new HttpError(502, 'Checkin employee list contains an invalid record');
  }
  const userId = parseUserId(value.userId ?? value.id);
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
  const rawUsername = value.username ?? value.userName;
  const username = typeof rawUsername === 'string' &&
    rawUsername.trim().length > 0 &&
    rawUsername.trim().length <= 80
      ? rawUsername.trim()
      : null;
  const rawName = value.name ?? value.fullName;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const isDeleted = isSystemAdmin(value.isDeleted) ||
    isSystemAdmin(value.deleted) ||
    (typeof value.deletedAt === 'string' && value.deletedAt.length > 0);
  const rawStatus = value.status ?? value.state;
  const status = isDeleted
    ? 'DELETED'
    : typeof rawStatus === 'string' && rawStatus.trim()
      ? rawStatus.trim().toUpperCase()
      : 'UNKNOWN';
  if (userId === null || !name || !status) {
    throw new HttpError(502, 'Checkin employee record is missing a valid user ID, email, name, or status');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) return null;
  return {
    userId,
    email,
    username,
    name: name.slice(0, 120),
    status: status.slice(0, 30),
    jobTitle: typeof (value.jobTitle ?? value.positionName) === 'string'
      ? String(value.jobTitle ?? value.positionName).trim().slice(0, 40) || null
      : null,
    department: typeof (value.department ?? value.departmentName) === 'string'
      ? String(value.department ?? value.departmentName).trim().slice(0, 80) || null
      : null,
    isAccAdmin: isSystemAdmin(value.isAccAdmin),
  };
}

async function getCheckinEmployeePage(options: CheckinEmployeePageOptions): Promise<CheckinEmployeePage> {
  const query = new URLSearchParams({
    page: String(options.page),
    limit: String(options.limit),
  });
  if (options.updatedSince) query.set('updated_since', options.updatedSince);
  const payload = await requestCheckin(
    EMPLOYEE_ENDPOINT,
    { method: 'GET' },
    { query, clientMessageId: uuidV7() },
  );
  const data = payload.data;
  const employees = getEmployeesArray(data);
  if (!employees) {
    throw new HttpError(502, 'Checkin service returned an unexpected employee list');
  }

  const metadata = isRecord(payload.pagination)
    ? payload.pagination
    : isRecord(payload.meta)
      ? payload.meta
      : isRecord(data) && isRecord(data.pagination)
        ? data.pagination
        : isRecord(data) && isRecord(data.meta)
          ? data.meta
          : isRecord(data)
            ? data
            : {};
  const hasNext = typeof metadata.hasNext === 'boolean'
    ? metadata.hasNext
    : typeof metadata.hasNextPage === 'boolean'
      ? metadata.hasNextPage
      : typeof metadata.totalPages === 'number'
        ? options.page < metadata.totalPages
        : typeof metadata.last === 'boolean'
          ? !metadata.last
          : employees.length === options.limit;

  const parsedEmployees = employees
    .filter((employee) => !isRecord(employee) || !isSystemAdmin(employee.isAccAdmin))
    .map(parseEmployee)
    .filter((employee): employee is CheckinEmployee => employee !== null);
  const skippedInvalidEmailCount = employees.length - parsedEmployees.length -
    employees.filter((employee) => isRecord(employee) && isSystemAdmin(employee.isAccAdmin)).length;
  if (skippedInvalidEmailCount > 0) {
    console.warn(
      `[Checkin sync] skipped ${skippedInvalidEmailCount} employee records with invalid or missing email on page ${options.page}.`,
    );
  }
  return { employees: parsedEmployees, hasMore: hasNext };
}

export async function* iterateCheckinEmployees(options: {
  limit: number;
  updatedSince?: string;
}): AsyncGenerator<CheckinEmployee> {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 1000) {
    throw new Error('Checkin employee page size must be an integer from 1 to 1000');
  }

  for (let page = 1; page <= MAX_EMPLOYEE_PAGES; page += 1) {
    const result = await getCheckinEmployeePage({
      page,
      limit: options.limit,
      updatedSince: options.updatedSince,
    });
    for (const employee of result.employees) {
      yield employee;
    }
    if (!result.hasMore) return;
  }
  throw new HttpError(502, `Checkin employee pagination exceeded ${MAX_EMPLOYEE_PAGES} pages`);
}
