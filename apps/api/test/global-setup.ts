import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
let embedded: EmbeddedPostgres | null = null;

function assertTestDatabase(databaseUrl: string): void {
  const name = new URL(databaseUrl).pathname;
  if (!name.endsWith('/sahana_test')) {
    throw new Error('Refusing to run tests against a database that is not named sahana_test');
  }
}

export async function setup(): Promise<void> {
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    const dir = mkdtempSync(path.join(tmpdir(), 'sahana-pg-'));
    embedded = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'postgres',
      password: 'postgres',
      port: 54330,
      persistent: false,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
    });
    await embedded.initialise();
    await embedded.start();
    await embedded.createDatabase('sahana_test');
    databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:54330/sahana_test';
  }
  assertTestDatabase(databaseUrl);
  const sessionSecret = process.env.SESSION_SECRET ?? randomBytes(32).toString('hex');
  if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters');
  }
  writeFileSync(
    path.join(here, '.test-env.json'),
    JSON.stringify({ DATABASE_URL: databaseUrl, SESSION_SECRET: sessionSecret }),
  );
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(here, '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}

export async function teardown(): Promise<void> {
  await embedded?.stop();
}
