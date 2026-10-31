import { createApp } from './app';
import { prisma } from './db';
import { assertBootEnv, readEnv } from './env';
import { log } from './logger';
import { sweepEmergencyDeadlines } from './modules/operations/operations.service';

async function main(): Promise<void> {
  const env = assertBootEnv();
  const role = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sahana_app') AS exists
  `;
  if (!role[0]?.exists) {
    throw new Error('Database role sahana_app is missing. Run migrations before starting the API.');
  }
  await prisma.$queryRaw`SELECT 1`;
  const app = createApp();
  const port = readEnv().port;
  if (readEnv().nodeEnv !== 'test') {
    const timer = setInterval(() => {
      void sweepEmergencyDeadlines(new Date()).catch((error: unknown) => {
        log('error', 'emergency sweep failed', { name: error instanceof Error ? error.name : 'unknown' });
      });
    }, 60_000);
    timer.unref();
  }
  app.listen(port, () => {
    log('info', 'api listening', { port, database: new URL(env.databaseUrl).pathname });
  });
}

main().catch((error: unknown) => {
  log('error', 'api failed to start', { name: error instanceof Error ? error.name : 'unknown' });
  process.exit(1);
});
