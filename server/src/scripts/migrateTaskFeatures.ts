import { migrateTaskFeatures } from '../utils/taskFeaturesMigration';

migrateTaskFeatures()
  .then(() => console.log('Hours, comments, subtasks, sprints, and Golive migration completed.'))
  .catch((error: unknown) => {
    console.error('Task feature migration failed:', error);
    process.exitCode = 1;
  });
