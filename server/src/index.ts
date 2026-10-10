import { createApp } from './app';
import { assertDbConnection } from './config/db';
import { env } from './config/env';

async function main() {
  try {
    await assertDbConnection();
    console.log('✓ Connected to MySQL');
  } catch (err) {
    console.error(
      '✗ Could not connect to MySQL. Is it running, and did you run `npm run db:init`?',
    );
    console.error(err);
    process.exit(1);
  }

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`✓ Server listening on http://localhost:${env.port}`);
  });
}

void main();
