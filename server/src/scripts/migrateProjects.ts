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
      `CREATE TABLE IF NOT EXISTS projects (
         id INT AUTO_INCREMENT PRIMARY KEY,
         code VARCHAR(40) NOT NULL UNIQUE,
         name VARCHAR(160) NOT NULL UNIQUE,
         description TEXT NULL,
         status ENUM('PLANNING','ACTIVE','ON_HOLD','COMPLETED') NOT NULL DEFAULT 'ACTIVE',
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS project_members (
         project_id INT NOT NULL,
         user_id INT NOT NULL,
         role_in_project VARCHAR(40) NOT NULL DEFAULT 'member',
         joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (project_id, user_id),
         CONSTRAINT fk_project_members_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE ON UPDATE CASCADE,
         CONSTRAINT fk_project_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    const [columns] = await connection.query<Array<RowDataPacket & { COLUMN_NAME: string }>>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'project_id'`,
    );
    if (columns.length === 0) await connection.query('ALTER TABLE tasks ADD COLUMN project_id INT NULL AFTER project');

    const [legacyProjects] = await connection.query<Array<RowDataPacket & { name: string }>>(
      `SELECT DISTINCT COALESCE(NULLIF(TRIM(project), ''), 'General') AS name
       FROM tasks WHERE project_id IS NULL ORDER BY name`,
    );
    for (const [index, row] of legacyProjects.entries()) {
      const [existing] = await connection.query<Array<RowDataPacket & { id: number }>>(
        'SELECT id FROM projects WHERE name = ? LIMIT 1', [row.name],
      );
      let projectId = existing[0]?.id;
      if (!projectId) {
        const [result] = await connection.query<mysql.ResultSetHeader>(
          'INSERT INTO projects (code, name, description, status) VALUES (?, ?, ?, ?)',
          [`LEG-${String(index + 1).padStart(4, '0')}`, row.name, 'Migrated from existing task data', 'ACTIVE'],
        );
        projectId = result.insertId;
      }
      await connection.query(
        `UPDATE tasks SET project_id = ?, project = ?
         WHERE project_id IS NULL AND COALESCE(NULLIF(TRIM(project), ''), 'General') = ?`,
        [projectId, row.name, row.name],
      );
    }

    const [remaining] = await connection.query<Array<RowDataPacket & { count: number }>>(
      'SELECT COUNT(*) AS count FROM tasks WHERE project_id IS NULL',
    );
    if (Number(remaining[0]?.count) > 0) throw new Error('Some tasks could not be assigned to a project');

    await connection.query(
      `INSERT IGNORE INTO project_members (project_id, user_id, role_in_project)
       SELECT DISTINCT tasks.project_id, tasks.assignee_user_id, 'member'
       FROM tasks WHERE tasks.assignee_user_id IS NOT NULL`,
    );
    await connection.query(
      `INSERT IGNORE INTO project_members (project_id, user_id, role_in_project)
       SELECT projects.id, users.id, 'lead' FROM projects CROSS JOIN users
       WHERE users.role = 'admin' OR users.job_title = 'Project Lead'`,
    );

    await connection.query('ALTER TABLE tasks MODIFY project_id INT NOT NULL');
    const [constraints] = await connection.query<Array<RowDataPacket & { CONSTRAINT_NAME: string }>>(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'
         AND COLUMN_NAME = 'project_id' AND REFERENCED_TABLE_NAME = 'projects'`,
    );
    if (constraints.length === 0) {
      await connection.query(
        `ALTER TABLE tasks ADD CONSTRAINT fk_tasks_project
         FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT ON UPDATE CASCADE`,
      );
    }
    console.log('Project migration completed. Existing tasks and assignees were preserved.');
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error('Project migration failed:', error);
  process.exitCode = 1;
});