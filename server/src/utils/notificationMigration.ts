import mysql, { type RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';

export async function migrateNotificationModule(): Promise<void> {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });

  try {
    const [columns] = await connection.query<Array<RowDataPacket & { COLUMN_NAME: string }>>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`,
    );
    if (!columns.some((column) => column.COLUMN_NAME === 'is_acc_admin')) {
      await connection.query('ALTER TABLE users ADD COLUMN is_acc_admin TINYINT(1) NOT NULL DEFAULT 0');
    }

    await connection.query(
      `CREATE TABLE IF NOT EXISTS user_fcm_tokens (
         id BIGINT AUTO_INCREMENT PRIMARY KEY,
         user_id INT NOT NULL,
         fcm_token VARCHAR(512) NOT NULL,
         is_bound TINYINT(1) NOT NULL DEFAULT 1,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uq_user_fcm_tokens_token (fcm_token),
         INDEX idx_user_fcm_tokens_user_bound (user_id, is_bound),
         CONSTRAINT fk_user_fcm_tokens_user FOREIGN KEY (user_id)
           REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS notification_history (
         id BIGINT AUTO_INCREMENT PRIMARY KEY,
         request_id CHAR(36) NOT NULL,
         user_id INT NOT NULL,
         partner_user_id BIGINT UNSIGNED NOT NULL,
         initiated_by_user_id INT NULL,
         source VARCHAR(30) NOT NULL DEFAULT 'SYSTEM',
         title VARCHAR(255) NOT NULL,
         body TEXT NOT NULL,
         data JSON NULL,
         delivery_status ENUM('RECORDED','SENT','FAILED') NOT NULL,
         device_count INT UNSIGNED NOT NULL DEFAULT 0,
         accepted_device_count INT UNSIGNED NOT NULL DEFAULT 0,
         error_code VARCHAR(100) NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         INDEX idx_notification_history_request (request_id),
         INDEX idx_notification_history_user_created (user_id, created_at),
         CONSTRAINT fk_notification_history_user FOREIGN KEY (user_id)
           REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    const [historyColumns] = await connection.query<Array<RowDataPacket & { COLUMN_NAME: string }>>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_history'`,
    );
    if (!historyColumns.some((column) => column.COLUMN_NAME === 'initiated_by_user_id')) {
      await connection.query(
        'ALTER TABLE notification_history ADD COLUMN initiated_by_user_id INT NULL AFTER partner_user_id',
      );
    }
    if (!historyColumns.some((column) => column.COLUMN_NAME === 'source')) {
      await connection.query(
        "ALTER TABLE notification_history ADD COLUMN source VARCHAR(30) NOT NULL DEFAULT 'SYSTEM' AFTER initiated_by_user_id",
      );
    }
    await connection.query(
      `ALTER TABLE notification_history
       MODIFY delivery_status ENUM('RECORDED','SENT','FAILED') NOT NULL`,
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS internal_partner_audit (
         id BIGINT AUTO_INCREMENT PRIMARY KEY,
         request_id CHAR(36) NOT NULL,
         partner_code VARCHAR(100) NULL,
         method VARCHAR(10) NOT NULL,
         path VARCHAR(255) NOT NULL,
         recipient_count SMALLINT UNSIGNED NULL,
         http_status SMALLINT UNSIGNED NOT NULL,
         outcome VARCHAR(40) NOT NULL,
         duration_ms INT UNSIGNED NOT NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         INDEX idx_internal_partner_audit_created (created_at),
         INDEX idx_internal_partner_audit_request (request_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
  } finally {
    await connection.end();
  }
}
