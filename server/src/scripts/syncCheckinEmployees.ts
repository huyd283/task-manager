import { pool } from '../config/db';
import { iterateCheckinEmployees } from '../services/checkinService';
import { upsertCheckinEmployee } from '../repositories/userRepository';
import { getEmployeeSyncCheckpoint, saveEmployeeSyncCheckpoint } from '../repositories/checkinSyncRepository';
import { env } from '../config/env';
import { migrateCheckinIntegration } from '../utils/checkinMigration';

async function main() {
  const syncStartedAt = new Date();
  try {
    await migrateCheckinIntegration();
    const checkpoint = await getEmployeeSyncCheckpoint();
    const overlapSeconds = env.checkin.employeeSyncOverlapSeconds;
    if (!Number.isFinite(overlapSeconds) || overlapSeconds < 0) {
      throw new Error('CHECKIN_EMPLOYEE_SYNC_OVERLAP_SECONDS must be a non-negative number');
    }
    const updatedSince = checkpoint
      ? new Date(new Date(checkpoint).getTime() - overlapSeconds * 1000).toISOString()
      : undefined;
    const pageSize = env.checkin.employeePageSize;
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedAdminCount = 0;
    for await (const employee of iterateCheckinEmployees({ limit: pageSize, updatedSince })) {
      const result = await upsertCheckinEmployee(employee);
      if (result === 'inserted') insertedCount += 1;
      if (result === 'updated') updatedCount += 1;
      if (result === 'skipped-admin') skippedAdminCount += 1;
    }
    await saveEmployeeSyncCheckpoint(syncStartedAt.toISOString());
    console.log(
      `Checkin employee sync completed: inserted=${insertedCount}, updated=${updatedCount}, skippedAdmins=${skippedAdminCount}; mode=${updatedSince ? 'incremental' : 'full'}.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Checkin employee sync failed:', error);
  process.exitCode = 1;
});
