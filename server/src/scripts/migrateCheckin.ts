import { migrateCheckinIntegration } from '../utils/checkinMigration';

migrateCheckinIntegration()
  .then(() => console.log('Checkin integration migration completed.'))
  .catch((error: unknown) => {
    console.error('Checkin integration migration failed:', error);
    process.exitCode = 1;
  });
