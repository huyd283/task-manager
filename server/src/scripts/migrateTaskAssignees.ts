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
      ['task_assignees_v1'],
    );

    const [columns] = await connection.query<Array<RowDataPacket & { COLUMN_NAME: string }>>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'
         AND COLUMN_NAME = 'assignee_user_id'`,
    );
    if (columns.length === 0) {
      await connection.query('ALTER TABLE tasks ADD COLUMN assignee_user_id INT NULL AFTER status');
    }

    if (applied.length === 0) {
      await connection.query(
        `UPDATE tasks AS task
         INNER JOIN users AS user ON user.name = task.assignee
         SET task.assignee_user_id = user.id
         WHERE task.assignee_user_id IS NULL`,
      );
    }

    const [indexes] = await connection.query<Array<RowDataPacket & { INDEX_NAME: string }>>(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'
         AND COLUMN_NAME = 'assignee_user_id'`,
    );
    if (indexes.length === 0) {
      await connection.query('ALTER TABLE tasks ADD INDEX idx_tasks_assignee_user_id (assignee_user_id)');
    }

    const [constraints] = await connection.query<Array<RowDataPacket & { CONSTRAINT_NAME: string }>>(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'
         AND COLUMN_NAME = 'assignee_user_id'
         AND REFERENCED_TABLE_NAME = 'users'`,
    );
    if (constraints.length === 0) {
      await connection.query(
        `ALTER TABLE tasks ADD CONSTRAINT fk_tasks_assignee_user
         FOREIGN KEY (assignee_user_id) REFERENCES users (id)
         ON DELETE SET NULL ON UPDATE CASCADE`,
      );
    }

    if (applied.length === 0) {
      await connection.query('INSERT INTO app_migrations (migration_name) VALUES (?)', ['task_assignees_v1']);
    }

    console.log('Task assignee migration completed. Existing assignee names were preserved.');
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error('Task assignee migration failed:', error);
  process.exitCode = 1;
});