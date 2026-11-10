import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';

const EMPLOYEE_SYNC_KEY = 'employees';

export async function getEmployeeSyncCheckpoint(): Promise<string | null> {
  const [rows] = await pool.query<Array<RowDataPacket & { updated_since: string | null }>>(
    'SELECT updated_since FROM checkin_sync_state WHERE sync_key = ? LIMIT 1',
    [EMPLOYEE_SYNC_KEY],
  );
  return rows[0]?.updated_since ?? null;
}

export async function saveEmployeeSyncCheckpoint(updatedSince: string): Promise<void> {
  await pool.query(
    `INSERT INTO checkin_sync_state (sync_key, updated_since)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE updated_since = VALUES(updated_since)`,
    [EMPLOYEE_SYNC_KEY, updatedSince],
  );
}
