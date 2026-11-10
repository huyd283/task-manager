-- Users table
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(190) NOT NULL UNIQUE,
  username   VARCHAR(80) NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  role       VARCHAR(30)  NOT NULL DEFAULT 'member',
  employee_code VARCHAR(20) NOT NULL UNIQUE,
  job_title  VARCHAR(40) NOT NULL DEFAULT 'Developer',
  department VARCHAR(80) NOT NULL DEFAULT 'Phát triển Phần mềm',
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  partner_user_id BIGINT UNSIGNED NULL,
  partner_status VARCHAR(30) NULL,
  is_acc_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_partner_user_id (partner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_fcm_tokens (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_history (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS internal_partner_audit (
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
  require_logged_time TINYINT(1) NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS sprints (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  task_code      VARCHAR(40)  NOT NULL UNIQUE,
  project        VARCHAR(120) NULL,
  project_id     INT NOT NULL,
  title          VARCHAR(255) NOT NULL,
  description    TEXT         NULL,
  status         ENUM('TODO','IN_PROGRESS','DEV_DONE','TESTING','TEST_FAIL','REVIEW','DONE','GOLIVE','PENDING') NOT NULL DEFAULT 'TODO',
  priority       ENUM('LOW','MEDIUM','HIGH','URGENT') NOT NULL DEFAULT 'MEDIUM',
  assignee_user_id INT        NULL,
  assignee       VARCHAR(120) NULL,
  start_date     DATE         NULL,
  estimated_date DATE         NULL,
  due_date       DATE         NULL,
  actual_date    DATE         NULL,
  completed_at   DATETIME     NULL,
  estimated_time DECIMAL(8,2) NULL,
  logged_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  golive_date DATE NULL,
  acceptance_notes TEXT NULL,
  sprint_id INT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at     DATETIME     NULL,
  deleted_by_user_id INT      NULL,
  INDEX idx_tasks_status (status),
  INDEX idx_tasks_deleted_at (deleted_at),
  INDEX idx_tasks_assignee (assignee),
  INDEX idx_tasks_assignee_user_id (assignee_user_id),
  INDEX idx_tasks_project (project),
  CONSTRAINT fk_tasks_assignee_user FOREIGN KEY (assignee_user_id)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_tasks_project FOREIGN KEY (project_id)
    REFERENCES projects (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_tasks_sprint FOREIGN KEY (sprint_id)
    REFERENCES sprints (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_comments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  user_id INT NULL,
  body MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_task_comments_task_created (task_id, created_at),
  CONSTRAINT fk_task_comments_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_task_comments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_subtasks (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (task_id, user_id),
  INDEX idx_task_assignees_user (user_id),
  CONSTRAINT fk_task_assignees_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_task_assignees_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
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
