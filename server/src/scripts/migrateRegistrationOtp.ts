import mysql from 'mysql2/promise';
import { env } from '../config/env';

async function main() {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });
  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS pending_registrations (
         email VARCHAR(190) PRIMARY KEY,
         name VARCHAR(120) NOT NULL,
         password_hash VARCHAR(255) NOT NULL,
         job_title VARCHAR(40) NOT NULL,
         department VARCHAR(80) NOT NULL,
         otp_hash CHAR(64) NOT NULL,
         expires_at DATETIME NOT NULL,
         resend_available_at DATETIME NOT NULL,
         attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         INDEX idx_pending_registrations_expiry (expires_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log('Registration OTP migration completed.');
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error('Registration OTP migration failed:', error);
  process.exitCode = 1;
});