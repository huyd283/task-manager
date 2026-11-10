import { migrateNotificationModule } from '../utils/notificationMigration';

migrateNotificationModule()
  .then(() => console.log('Notification module migration completed.'))
  .catch((error: unknown) => {
    console.error('Notification module migration failed:', error);
    process.exitCode = 1;
  });
