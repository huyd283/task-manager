import mysql, { type RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';

async function ensureColumn(
  connection: mysql.Connection,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const [rows] = await connection.query<Array<RowDataPacket & { count: number }>>(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (Number(rows[0]?.count) === 0) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

export async function migrateTaskFeatures(): Promise<void> {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });

  try {
    await ensureColumn(connection, 'tasks', 'estimated_time', 'DECIMAL(8,2) NULL');
    await ensureColumn(connection, 'tasks', 'logged_hours', 'DECIMAL(8,2) NOT NULL DEFAULT 0');
    await ensureColumn(connection, 'tasks', 'golive_date', 'DATE NULL');
    await ensureColumn(connection, 'tasks', 'acceptance_notes', 'TEXT NULL');
    await ensureColumn(connection, 'projects', 'require_logged_time', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn(connection, 'users', 'username', 'VARCHAR(80) NULL');

    await connection.query(
      `UPDATE users SET username = CONCAT(
         LEFT(REGEXP_REPLACE(LOWER(SUBSTRING_INDEX(email, '@', 1)), '[^a-z0-9._-]', '-'), 60), '-', id)
       WHERE username IS NULL OR username = ''`,
    );
    await connection.query('ALTER TABLE users MODIFY username VARCHAR(80) NOT NULL');
    const [usernameIndex] = await connection.query<Array<RowDataPacket & { count: number }>>(
      `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username'
         AND NON_UNIQUE = 0`,
    );
    if (Number(usernameIndex[0]?.count) === 0) {
      await connection.query('ALTER TABLE users ADD UNIQUE KEY uq_users_username (username)');
    }

    await connection.query(
      `ALTER TABLE tasks MODIFY status
       ENUM('TODO','IN_PROGRESS','DEV_DONE','TESTING','TEST_FAIL','DONE','REVIEW','GOLIVE','PENDING')
       NOT NULL DEFAULT 'TODO'`,
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS task_comments (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        user_id INT NULL,
        body MEDIUMTEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_task_comments_task_created (task_id, created_at),
        CONSTRAINT fk_task_comments_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
        CONSTRAINT fk_task_comments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS task_subtasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        assignee_user_id INT NULL,
        status ENUM('TODO','IN_PROGRESS','DONE') NOT NULL DEFAULT 'TODO',
        estimated_hours DECIMAL(8,2) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_task_subtasks_parent_status (task_id, status),
        CONSTRAINT fk_task_subtasks_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
        CONSTRAINT fk_task_subtasks_assignee FOREIGN KEY (assignee_user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS sprints (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        name VARCHAR(120) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        goal TEXT NULL,
        status ENUM('PLANNING','ACTIVE','COMPLETED') NOT NULL DEFAULT 'PLANNING',
        created_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sprints_project_status (project_id, status),
        CONSTRAINT fk_sprints_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
        CONSTRAINT fk_sprints_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await ensureColumn(connection, 'tasks', 'sprint_id', 'INT NULL');
    const [sprintFk] = await connection.query<Array<RowDataPacket & { count: number }>>(
      `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND CONSTRAINT_NAME = 'fk_tasks_sprint'`,
    );
    if (Number(sprintFk[0]?.count) === 0) {
      await connection.query(
        'ALTER TABLE tasks ADD CONSTRAINT fk_tasks_sprint FOREIGN KEY (sprint_id) REFERENCES sprints (id) ON DELETE SET NULL',
      );
    }
  } finally {
    await connection.end();
  }
}
