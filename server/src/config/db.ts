import mysql from 'mysql2/promise';
import { env } from './env';

/**
 * Shared MySQL connection pool used across the app.
 * `dateStrings: true` keeps DATE/DATETIME columns as plain strings
 * (e.g. "2026-10-08") so they serialise cleanly to JSON.
 */
export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

/** Throws if a connection to MySQL cannot be established. */
export async function assertDbConnection(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}
