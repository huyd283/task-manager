import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';

/**
 * One-shot setup script:
 *   1. creates the database (if missing)
 *    2. creates the application tables from schema.sql
 *   3. seeds mock data so the app can be run and tested immediately
 *
 * Run with: `npm run db:init`
 */

const SEED_PASSWORD = 'password123';

const USERS: Array<[name: string, email: string, role: string]> = [
  ['Nguyen Van An', 'an@taskmanager.dev', 'admin'],
  ['Tran Thi Binh', 'binh@taskmanager.dev', 'member'],
  ['Le Van Cuong', 'cuong@taskmanager.dev', 'member'],
  ['Pham Thi Dung', 'dung@taskmanager.dev', 'member'],
];

type TaskSeed = [
  task_code: string,
  project: string,
  title: string,
  description: string,
  status: string,
  assignee: string,
  start_date: string | null,
  estimated_date: string | null,
  due_date: string | null,
  actual_date: string | null,
];

const TASKS: TaskSeed[] = [
  ['TM-0001', 'Website Redesign', 'Thiết kế lại trang chủ', 'Dựng lại layout trang chủ theo brand mới.', 'DONE', 'Nguyen Van An', '2026-09-01', '2026-09-10', '2026-09-12', '2026-09-11'],
  ['TM-0002', 'Website Redesign', 'Tối ưu tốc độ tải trang', 'Lazy-load ảnh và tách bundle JS.', 'IN_PROGRESS', 'Tran Thi Binh', '2026-09-15', '2026-09-25', '2026-09-28', null],
  ['TM-0003', 'Mobile App', 'Xây dựng màn hình đăng nhập', 'Form đăng nhập + lưu token.', 'DEV_DONE', 'Le Van Cuong', '2026-09-20', '2026-09-30', '2026-10-02', null],
  ['TM-0004', 'Mobile App', 'Tích hợp push notification', 'Dùng FCM cho Android/iOS.', 'TODO', 'Pham Thi Dung', '2026-10-05', '2026-10-15', '2026-10-18', null],
  ['TM-0005', 'API Platform', 'Thiết kế schema cơ sở dữ liệu', 'ERD cho users, tasks, projects.', 'DONE', 'Nguyen Van An', '2026-08-20', '2026-08-28', '2026-08-30', '2026-08-27'],
  ['TM-0006', 'API Platform', 'Viết tài liệu API', 'Mô tả toàn bộ endpoint bằng OpenAPI.', 'PENDING', 'Tran Thi Binh', '2026-09-10', '2026-09-20', '2026-09-22', null],
  ['TM-0007', 'API Platform', 'Xây dựng module xác thực JWT', 'Login/register + middleware verify.', 'IN_PROGRESS', 'Le Van Cuong', '2026-10-01', '2026-10-08', '2026-10-10', null],
  ['TM-0008', 'Website Redesign', 'Kiểm thử giao diện responsive', 'Test trên mobile/tablet/desktop.', 'TODO', 'Tran Thi Binh', '2026-10-07', '2026-10-14', '2026-10-16', null],
  ['TM-0009', 'Mobile App', 'Sửa lỗi crash khi mở camera', 'Crash trên một số máy Android 13.', 'IN_PROGRESS', 'Pham Thi Dung', '2026-09-28', '2026-10-03', '2026-10-01', null],
  ['TM-0010', 'Data Pipeline', 'Thiết lập ETL hằng ngày', 'Job cron tổng hợp dữ liệu mỗi đêm.', 'DONE', 'Nguyen Van An', '2026-09-05', '2026-09-15', '2026-09-18', '2026-09-16'],
  ['TM-0011', 'Data Pipeline', 'Xây dựng dashboard báo cáo', 'Biểu đồ theo nhân sự và trạng thái.', 'TESTING', 'Le Van Cuong', '2026-09-25', '2026-10-05', '2026-10-07', null],
  ['TM-0012', 'API Platform', 'Rà soát bảo mật endpoint', 'Kiểm tra authz cho toàn bộ route.', 'PENDING', 'Pham Thi Dung', '2026-10-02', '2026-10-12', '2026-09-30', null],
];

async function main() {
  // 1. Connect without a database so we can create it, enabling
  //    multipleStatements to run the whole schema.sql file in one go.
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await connection.changeUser({ database: env.db.database });
  console.log(`✓ Database '${env.db.database}' ready`);

  // 2. Create tables
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await connection.query(schema);
  console.log('✓ Application tables created');

  // 3. Reset existing data so the seed is idempotent
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query('TRUNCATE TABLE task_history');
  await connection.query('TRUNCATE TABLE task_attachments');
  await connection.query('TRUNCATE TABLE tasks');
  await connection.query('TRUNCATE TABLE project_members');
  await connection.query('TRUNCATE TABLE projects');
  await connection.query('TRUNCATE TABLE users');
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  // 4. Seed users (all share the same demo password)
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  for (const [index, [name, email, role]] of USERS.entries()) {
    await connection.query(
      `INSERT INTO users
         (name, email, password, role, employee_code, job_title, department)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email,
        passwordHash,
        role,
        `NV-${String(index + 1).padStart(5, '0')}`,
        role === 'admin' ? 'Project Lead' : 'Developer',
        'Phát triển Phần mềm',
      ],
    );
  }
  console.log(`✓ Seeded ${USERS.length} users (password for all: "${SEED_PASSWORD}")`);

  // 5. Seed tasks
  const projectNames = [...new Set(TASKS.map((task) => task[1]))];
  const projectIds = new Map<string, number>();
  for (const [index, name] of projectNames.entries()) {
    const [result] = await connection.query<mysql.ResultSetHeader>(
      'INSERT INTO projects (code, name, description, status) VALUES (?, ?, ?, ?)',
      [`TM-P${String(index + 1).padStart(3, '0')}`, name, `Dự án ${name}`, 'ACTIVE'],
    );
    projectIds.set(name, result.insertId);
  }
  const [seedUsers] = await connection.query<Array<RowDataPacket & { id: number; name: string }>>(
    'SELECT id, name FROM users',
  );
  const userIds = new Map(seedUsers.map((user) => [user.name, user.id]));

  // 5. Seed memberships and tasks
  for (const task of TASKS) {
    const projectId = projectIds.get(task[1]);
    const assigneeId = userIds.get(task[5]);
    if (!projectId || !assigneeId) throw new Error(`Could not resolve project or assignee for ${task[0]}`);
    await connection.query(
      `INSERT IGNORE INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, 'member')`,
      [projectId, assigneeId],
    );
    await connection.query(
      `INSERT INTO tasks
        (task_code, project_id, project, title, description, status, assignee_user_id, assignee,
         start_date, estimated_date, due_date, actual_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [task[0], projectId, task[1], task[2], task[3], task[4], assigneeId, task[5], ...task.slice(6)],
    );
  }
  console.log(`✓ Seeded ${TASKS.length} tasks`);

  await connection.end();
  console.log('\n🎉 Database initialised. Now run `npm run dev` from the project root.');
}

main().catch((err) => {
  console.error('✗ Database init failed:', err);
  process.exit(1);
});
