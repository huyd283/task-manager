import { migrateDailyCheckin } from '../utils/dailyCheckinMigration';

migrateDailyCheckin()
  .then(() => console.log('Daily check-in migration completed.'))
  .catch((error: unknown) => {
    console.error('Daily check-in migration failed:', error);
    process.exitCode = 1;
  });
