import { checkDatabaseConnection } from '../db/client.js';

async function run() {
  const result = await checkDatabaseConnection();

  if (!result.reachable) {
    console.error(result.message);
    process.exit(1);
  }

  console.log(result.message);
}

void run();
