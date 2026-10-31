import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnvFiles(): void {
  for (const file of [path.join(apiRoot, '.env'), path.join(apiRoot, '../../.env')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnvFiles();

export function readEnv() {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const sessionSecret = process.env.SESSION_SECRET ?? '';
  return {
    nodeEnv,
    databaseUrl,
    sessionSecret,
    port: Number(process.env.PORT ?? 4000),
    corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:8081')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

export function assertBootEnv(): { sessionSecret: string; databaseUrl: string } {
  const env = readEnv();
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  if (env.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters');
  }
  if (env.nodeEnv === 'production' && process.env.MFA_REQUIRED !== 'true') {
    throw new Error('MFA_REQUIRED must be true in production');
  }
  return { sessionSecret: env.sessionSecret, databaseUrl: env.databaseUrl };
}
