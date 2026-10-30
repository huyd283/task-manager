-- Users table
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(190) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  role       VARCHAR(30)  NOT NULL DEFAULT 'member',
  employee_code VARCHAR(20) NOT NULL UNIQUE,
  job_title  VARCHAR(40) NOT NULL DEFAULT 'Developer',
  department VARCHAR(80) NOT NULL DEFAULT 'Phát triển Phần mềm',
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pending_registrations (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tasks table
CREATE TABLE IF NOT EXISTS projects (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(40) NOT NULL UNIQUE,
  name        VARCHAR(160) NOT NULL UNIQUE,
  description TEXT NULL,
  status      ENUM('PLANNING','ACTIVE','ON_HOLD','COMPLETED') NOT NULL DEFAULT 'ACTIVE',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_members (
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  role_in_project VARCHAR(40) NOT NULL DEFAULT 'member',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  CONSTRAINT fk_project_members_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_project_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  task_code      VARCHAR(40)  NOT NULL UNIQUE,
  project        VARCHAR(120) NULL,
  project_id     INT NOT NULL,
  title          VARCHAR(255) NOT NULL,
  description    TEXT         NULL,
  status         ENUM('TODO','IN_PROGRESS','DEV_DONE','TESTING','TEST_FAIL','DONE','PENDING') NOT NULL DEFAULT 'TODO',
  priority       ENUM('LOW','MEDIUM','HIGH','URGENT') NOT NULL DEFAULT 'MEDIUM',
  assignee_user_id INT        NULL,
  assignee       VARCHAR(120) NULL,
  start_date     DATE         NULL,
  estimated_date DATE         NULL,
  due_date       DATE         NULL,
  actual_date    DATE         NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tasks_status (status),
  INDEX idx_tasks_assignee (assignee),
  INDEX idx_tasks_assignee_user_id (assignee_user_id),
  INDEX idx_tasks_project (project),
  CONSTRAINT fk_tasks_assignee_user FOREIGN KEY (assignee_user_id)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_tasks_project FOREIGN KEY (project_id)
    REFERENCES projects (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  user_id INT NULL,
  action_type VARCHAR(40) NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_task_history_task_timestamp (task_id, `timestamp`),
  CONSTRAINT fk_task_history_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_task_history_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_attachments (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
