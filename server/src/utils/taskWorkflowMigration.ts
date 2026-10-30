import mysql, { type RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';

const FINAL_STATUS_ENUM = "enum('TODO','IN_PROGRESS','DEV_DONE','TESTING','TEST_FAIL','DONE','PENDING')";
const LEGACY_STATUS_ENUM =
  "enum('TODO','IN_PROGRESS','IN_REVIEW','DEV_DONE','TESTING','TEST_FAIL','DONE','PENDING')";

export async function migrateTaskWorkflow(): Promise<void> {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });

  try {
    const [statusColumns] = await connection.query<Array<RowDataPacket & { COLUMN_TYPE: string }>>(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'status'`,
    );
    if (statusColumns.length === 0) {
      throw new Error('Cannot migrate task workflow: tasks.status does not exist');
    }

    let statusColumnType = String(statusColumns[0].COLUMN_TYPE).toLowerCase();
    if (statusColumnType.includes("'in_review'")) {
      if (statusColumnType !== LEGACY_STATUS_ENUM.toLowerCase()) {
        await connection.query(
          `ALTER TABLE tasks
           MODIFY status ENUM('TODO','IN_PROGRESS','IN_REVIEW','DEV_DONE','TESTING','TEST_FAIL','DONE','PENDING')
           NOT NULL DEFAULT 'TODO'`,
        );
      }
      await connection.query("UPDATE tasks SET status = 'DEV_DONE' WHERE status = 'IN_REVIEW'");
      statusColumnType = LEGACY_STATUS_ENUM.toLowerCase();
    }
    if (statusColumnType !== FINAL_STATUS_ENUM.toLowerCase()) {
      await connection.query(
        `ALTER TABLE tasks
         MODIFY status ENUM('TODO','IN_PROGRESS','DEV_DONE','TESTING','TEST_FAIL','DONE','PENDING')
         NOT NULL DEFAULT 'TODO'`,
      );
    }

    const [priorityColumns] = await connection.query<Array<RowDataPacket & { COLUMN_NAME: string }>>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'priority'`,
    );
    if (priorityColumns.length === 0) {
      await connection.query(
        "ALTER TABLE tasks ADD COLUMN priority ENUM('LOW','MEDIUM','HIGH','URGENT') NOT NULL DEFAULT 'MEDIUM' AFTER status",
      );
    }

    await connection.query(
      `CREATE TABLE IF NOT EXISTS task_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        user_id INT NULL,
        action_type VARCHAR(40) NOT NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        \`timestamp\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_task_history_task_timestamp (task_id, \`timestamp\`),
        CONSTRAINT fk_task_history_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_task_history_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS task_attachments (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        user_id INT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_data MEDIUMBLOB NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_task_attachments_task_created (task_id, created_at),
        CONSTRAINT fk_task_attachments_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_task_attachments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
  } finally {
    await connection.end();
  }
}
