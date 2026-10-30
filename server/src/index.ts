import { createApp } from './app';
import { assertDbConnection } from './config/db';
import { env } from './config/env';
import { migrateTaskWorkflow } from './utils/taskWorkflowMigration';

async function main() {
  try {
    await migrateTaskWorkflow();
    console.log('✓ Task workflow database is up to date');
    await assertDbConnection();
    console.log('✓ Connected to MySQL');
  } catch (err) {
    console.error('✗ Could not prepare the database. Verify DB access and initialize the base schema if needed.');
    console.error(err);
    process.exit(1);
  }

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`✓ Server listening on http://localhost:${env.port}`);
  });
}

void main();
