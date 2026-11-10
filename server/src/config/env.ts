import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Centralised, typed access to environment variables with sensible
 * local-development defaults so the app can boot out of the box.
 */
export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  email: {
    host: process.env.EMAIL_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT ?? 465),
    secure: (process.env.EMAIL_SECURE ?? 'true') === 'true',
    user: process.env.EMAIL_USER ?? '',
    password: process.env.EMAIL_PASS ?? '',
    from: process.env.EMAIL_FROM ?? process.env.EMAIL_USER ?? '',
  },
  checkin: {
    baseUrl: process.env.CHECKIN_BASE_URL?.trim() ?? '',
    partnerCode: process.env.CHECKIN_PARTNER_CODE?.trim() ?? 'TMT_PM',
    partnerToken: process.env.CHECKIN_PARTNER_TOKEN?.trim() ?? '',
    employeePageSize: Number(process.env.CHECKIN_EMPLOYEE_PAGE_SIZE ?? 200),
    employeeSyncOverlapSeconds: Number(process.env.CHECKIN_EMPLOYEE_SYNC_OVERLAP_SECONDS ?? 120),
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID?.trim() ?? '',
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '',
  },
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'task_manager',
  },
};
