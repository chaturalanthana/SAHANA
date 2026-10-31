import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(apiRoot, '../../.pgdata');
const port = 54329;
const password = 'postgres';
const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/sahana`;

const embedded = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password,
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

async function main(): Promise<void> {
  try {
    await embedded.initialise();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!/already|exists/i.test(message)) throw error;
  }
  await embedded.start();
  try {
    await embedded.createDatabase('sahana');
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!/already exists/i.test(message)) throw error;
  }
  execSync('pnpm exec prisma migrate deploy', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
  console.log(`Local database is ready at ${databaseUrl}`);
  await new Promise(() => undefined);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'database failed to start');
  process.exit(1);
});
