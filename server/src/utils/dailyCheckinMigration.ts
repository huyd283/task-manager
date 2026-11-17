import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { env } from '../config/env';

export async function migrateDailyCheckin(): Promise<void> {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });

  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS daily_checkins (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        checkin_date DATE NOT NULL,
        reviewed_task_ids TEXT NOT NULL,
        review_confirmed TINYINT(1) NOT NULL DEFAULT 0,
        plan_confirmed TINYINT(1) NOT NULL DEFAULT 0,
        blocker_status ENUM('NONE','BLOCKED') NULL,
        blocker_description TEXT NULL,
        blocker_task_id INT NULL,
        blocker_impact ENUM('LOW','MEDIUM','HIGH') NULL,
        blocker_feedback TEXT NULL,
        blocker_feedback_by_user_id INT NULL,
        blocker_feedback_at DATETIME NULL,
        is_complete TINYINT(1) NOT NULL DEFAULT 0,
        completed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_daily_checkins_user_date (user_id, checkin_date),
        INDEX idx_daily_checkins_date_blocker (checkin_date, blocker_status),
        INDEX idx_daily_checkins_blocker_task (blocker_task_id),
        CONSTRAINT fk_daily_checkins_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_daily_checkins_blocker_task FOREIGN KEY (blocker_task_id)
          REFERENCES tasks (id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    const [columns] = await connection.query<Array<RowDataPacket & { Field: string }>>(
      'SHOW COLUMNS FROM daily_checkins',
    );
    const existingColumns = new Set(columns.map((column) => column.Field));
    if (!existingColumns.has('blocker_feedback')) {
      await connection.query('ALTER TABLE daily_checkins ADD COLUMN blocker_feedback TEXT NULL');
    }
    if (!existingColumns.has('blocker_feedback_by_user_id')) {
      await connection.query('ALTER TABLE daily_checkins ADD COLUMN blocker_feedback_by_user_id INT NULL');
    }
    if (!existingColumns.has('blocker_feedback_at')) {
      await connection.query('ALTER TABLE daily_checkins ADD COLUMN blocker_feedback_at DATETIME NULL');
    }
    await connection.query(
      `CREATE TABLE IF NOT EXISTS daily_checkin_tasks (
        user_id INT NOT NULL,
        checkin_date DATE NOT NULL,
        task_id INT NOT NULL,
        position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, checkin_date, task_id),
        INDEX idx_daily_checkin_tasks_task_date (task_id, checkin_date),
        CONSTRAINT fk_daily_checkin_tasks_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_daily_checkin_tasks_task FOREIGN KEY (task_id)
          REFERENCES tasks (id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_daily_checkin_tasks_checkin FOREIGN KEY (user_id, checkin_date)
          REFERENCES daily_checkins (user_id, checkin_date) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS daily_checkin_blockers (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        checkin_id BIGINT UNSIGNED NOT NULL,
        status ENUM('OPEN','IN_PROGRESS','RESOLVED') NOT NULL DEFAULT 'OPEN',
        priority ENUM('CRITICAL','HIGH','MEDIUM','LOW') NOT NULL DEFAULT 'MEDIUM',
        category ENUM('TECHNICAL','DEPENDENCY','RESOURCE','ACCESS','OTHER') NOT NULL DEFAULT 'OTHER',
        assignee_user_id INT NULL,
        version INT UNSIGNED NOT NULL DEFAULT 1,
        resolved_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_daily_checkin_blockers_checkin (checkin_id),
        INDEX idx_daily_checkin_blockers_status_priority (status, priority, updated_at),
        INDEX idx_daily_checkin_blockers_assignee (assignee_user_id, status),
        CONSTRAINT fk_daily_checkin_blockers_checkin FOREIGN KEY (checkin_id)
          REFERENCES daily_checkins (id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_daily_checkin_blockers_assignee FOREIGN KEY (assignee_user_id)
          REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    const [blockerColumns] = await connection.query<Array<RowDataPacket & { Field: string }>>(
      'SHOW COLUMNS FROM daily_checkin_blockers',
    );
    if (!blockerColumns.some((column) => column.Field === 'category')) {
      await connection.query(
        "ALTER TABLE daily_checkin_blockers ADD COLUMN category ENUM('TECHNICAL','DEPENDENCY','RESOURCE','ACCESS','OTHER') NOT NULL DEFAULT 'OTHER' AFTER priority",
      );
    }
    await connection.query(
      `CREATE TABLE IF NOT EXISTS daily_checkin_blocker_comments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        blocker_id BIGINT UNSIGNED NOT NULL,
        user_id INT NULL,
        body TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_daily_checkin_blocker_comments_blocker (blocker_id, created_at),
        CONSTRAINT fk_daily_checkin_blocker_comments_blocker FOREIGN KEY (blocker_id)
          REFERENCES daily_checkin_blockers (id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_daily_checkin_blocker_comments_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS daily_checkin_blocker_history (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        blocker_id BIGINT UNSIGNED NOT NULL,
        user_id INT NULL,
        action_type VARCHAR(40) NOT NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_daily_checkin_blocker_history_blocker (blocker_id, created_at),
        CONSTRAINT fk_daily_checkin_blocker_history_blocker FOREIGN KEY (blocker_id)
          REFERENCES daily_checkin_blockers (id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_daily_checkin_blocker_history_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS daily_checkin_reminders (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        checkin_date DATE NOT NULL,
        initiated_by_user_id INT NOT NULL,
        status ENUM('SENDING','SUBMITTED','FAILED') NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_daily_checkin_reminders_user_date (user_id, checkin_date),
        CONSTRAINT fk_daily_checkin_reminders_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_daily_checkin_reminders_manager FOREIGN KEY (initiated_by_user_id)
          REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await connection.query(
      `INSERT IGNORE INTO daily_checkin_blockers (checkin_id, status, priority)
       SELECT id, 'OPEN',
              CASE blocker_impact
                WHEN 'HIGH' THEN 'HIGH'
                WHEN 'LOW' THEN 'LOW'
                ELSE 'MEDIUM'
              END
       FROM daily_checkins
       WHERE blocker_status = 'BLOCKED' AND is_complete = 1`,
    );
    await connection.query(
      `INSERT INTO daily_checkin_blocker_history
         (blocker_id, user_id, action_type, old_value, new_value)
       SELECT b.id, c.user_id, 'reported', NULL, c.blocker_description
       FROM daily_checkin_blockers b
       JOIN daily_checkins c ON c.id = b.checkin_id
       LEFT JOIN daily_checkin_blocker_history h
         ON h.blocker_id = b.id AND h.action_type = 'reported'
       WHERE h.id IS NULL`,
    );
  } finally {
    await connection.end();
  }
}
