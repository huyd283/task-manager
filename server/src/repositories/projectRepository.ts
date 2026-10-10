import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db';

export interface ProjectMember extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  employee_code: string;
  role_in_project: string;
}

export interface ProjectRecord extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
  created_at: string;
  updated_at: string;
  task_count: number;
  members: ProjectMember[];
}

export interface ProjectInput {
  code: string;
  name: string;
  description: string | null;
  status: ProjectRecord['status'];
  memberIds: number[];
}

export async function listProjects(userId?: number): Promise<ProjectRecord[]> {
  const [rows] = await pool.query<Array<RowDataPacket & Omit<ProjectRecord, 'members'>>>(
    `SELECT p.*, COUNT(DISTINCT t.id) AS task_count
     FROM projects p
     LEFT JOIN tasks t ON t.project_id = p.id
     ${userId ? 'WHERE EXISTS (SELECT 1 FROM project_members mine WHERE mine.project_id = p.id AND mine.user_id = ?)' : ''}
     GROUP BY p.id ORDER BY p.updated_at DESC, p.name ASC`,
    userId ? [userId] : [],
  );
  const projects = rows as ProjectRecord[];
  if (projects.length === 0) return projects;
  const ids = projects.map((project) => project.id);
  const [memberRows] = await pool.query<ProjectMember[]>(
    `SELECT pm.project_id, u.id, u.name, u.email, u.employee_code, pm.role_in_project
     FROM project_members pm JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id IN (${ids.map(() => '?').join(',')}) ORDER BY u.name ASC`,
    ids,
  );
  return projects.map((project) => ({
    ...project,
    members: memberRows.filter((member) => (member as ProjectMember & { project_id: number }).project_id === project.id),
  }));
}

export async function getProject(id: number): Promise<ProjectRecord | null> {
  const projects = await listProjects();
  return projects.find((project) => project.id === id) ?? null;
}

export async function isProjectMember(projectId: number, userId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1',
    [projectId, userId],
  );
  return rows.length > 0;
}

export async function projectExists(projectId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT 1 FROM projects WHERE id = ? LIMIT 1', [projectId]);
  return rows.length > 0;
}

export async function createProject(input: ProjectInput): Promise<number> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query<ResultSetHeader>(
      'INSERT INTO projects (code, name, description, status) VALUES (?, ?, ?, ?)',
      [input.code, input.name, input.description, input.status],
    );
    await replaceMembers(connection, result.insertId, input.memberIds);
    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateProject(id: number, input: ProjectInput): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'UPDATE projects SET code = ?, name = ?, description = ?, status = ? WHERE id = ?',
      [input.code, input.name, input.description, input.status, id],
    );
    await replaceMembers(connection, id, input.memberIds);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteProject(id: number): Promise<void> {
  await pool.query('DELETE FROM projects WHERE id = ?', [id]);
}

export async function addMember(projectId: number, userId: number, role: string): Promise<void> {
  await pool.query(
    `INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project)`,
    [projectId, userId, role],
  );
}

export async function removeMember(projectId: number, userId: number): Promise<void> {
  await pool.query('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
}

async function replaceMembers(connection: Awaited<ReturnType<typeof pool.getConnection>>, projectId: number, memberIds: number[]) {
  await connection.query('DELETE FROM project_members WHERE project_id = ?', [projectId]);
  if (memberIds.length > 0) {
    await connection.query(
      `INSERT INTO project_members (project_id, user_id) VALUES ${memberIds.map(() => '(?, ?)').join(',')}`,
      memberIds.flatMap((userId) => [projectId, userId]),
    );
  }
}