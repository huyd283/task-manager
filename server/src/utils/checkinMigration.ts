import mysql, { type RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';

export async function migrateCheckinIntegration(): Promise<void> {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });

  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS checkin_sync_state (
         sync_key VARCHAR(60) PRIMARY KEY,
         updated_since VARCHAR(40) NULL,
         updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    const [columns] = await connection.query<Array<RowDataPacket & { COLUMN_NAME: string }>>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`,
    );
    const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));

    if (!existingColumns.has('partner_user_id')) {
      await connection.query('ALTER TABLE users ADD COLUMN partner_user_id BIGINT UNSIGNED NULL');
    }
    if (!existingColumns.has('partner_status')) {
      await connection.query('ALTER TABLE users ADD COLUMN partner_status VARCHAR(30) NULL');
    }

    const [indexes] = await connection.query<Array<RowDataPacket & { INDEX_NAME: string }>>(
      `SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'partner_user_id' AND NON_UNIQUE = 0`,
    );
    if (indexes.length === 0) {
      await connection.query(
        'ALTER TABLE users ADD UNIQUE INDEX uq_users_partner_user_id (partner_user_id)',
      );
    }
  } finally {
    await connection.end();
  }
}
