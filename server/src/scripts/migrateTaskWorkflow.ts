import { migrateTaskWorkflow } from '../utils/taskWorkflowMigration';

migrateTaskWorkflow()
  .then(() => console.log('Task workflow, priority, history, and attachment migration completed.'))
  .catch((error: unknown) => {
    console.error('Task workflow migration failed:', error);
    process.exitCode = 1;
  });
