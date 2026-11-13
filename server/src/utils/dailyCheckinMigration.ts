import mysql from 'mysql2/promise';
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
  } finally {
    await connection.end();
  }
}
