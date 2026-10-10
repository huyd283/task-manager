import mysql, { type RowDataPacket } from 'mysql2/promise';
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
      `CREATE TABLE IF NOT EXISTS app_migrations (
         migration_name VARCHAR(100) PRIMARY KEY,
         applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    const [applied] = await connection.query<Array<RowDataPacket & { migration_name: string }>>(
      'SELECT migration_name FROM app_migrations WHERE migration_name = ?',
      ['user_management_v1'],
    );
    const needsLegacyBackfill = applied.length === 0;

    const [columns] = await connection.query<Array<RowDataPacket & { COLUMN_NAME: string }>>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`,
    );
    const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));

    if (!existingColumns.has('employee_code')) {
      await connection.query('ALTER TABLE users ADD COLUMN employee_code VARCHAR(20) NULL');
    }
    if (!existingColumns.has('job_title')) {
      await connection.query('ALTER TABLE users ADD COLUMN job_title VARCHAR(40) NULL');
    }
    if (!existingColumns.has('department')) {
      await connection.query('ALTER TABLE users ADD COLUMN department VARCHAR(80) NULL');
    }
    if (!existingColumns.has('is_active')) {
      await connection.query('ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
    }

    if (needsLegacyBackfill) {
      await connection.query(
        `UPDATE users
         SET employee_code = CONCAT('NV-', LPAD(id, 5, '0'))
         WHERE employee_code IS NULL OR employee_code = ''`,
      );
      await connection.query(
        `UPDATE users
         SET job_title = CASE WHEN role = 'admin' THEN 'Project Lead' ELSE 'Developer' END
         WHERE job_title IS NULL OR job_title = ''`,
      );
      await connection.query(
        `UPDATE users SET department = 'Phát triển Phần mềm'
         WHERE department IS NULL OR department = ''`,
      );
      await connection.query('UPDATE users SET is_active = 1');
    }

    await connection.query(
      `ALTER TABLE users
       MODIFY employee_code VARCHAR(20) NOT NULL,
       MODIFY job_title VARCHAR(40) NOT NULL DEFAULT 'Developer',
       MODIFY department VARCHAR(80) NOT NULL DEFAULT 'Phát triển Phần mềm'`,
    );

    const [indexes] = await connection.query<Array<RowDataPacket & { INDEX_NAME: string }>>(
      `SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'employee_code' AND NON_UNIQUE = 0`,
    );
    if (indexes.length === 0) {
      await connection.query(
        'ALTER TABLE users ADD UNIQUE INDEX uq_users_employee_code (employee_code)',
      );
    }

    if (needsLegacyBackfill) {
      await connection.query('INSERT INTO app_migrations (migration_name) VALUES (?)', ['user_management_v1']);
    }

    console.log('User management migration completed without resetting existing data.');
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error('User management migration failed:', error);
  process.exitCode = 1;
});