import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('./.test-env.json', import.meta.url), 'utf8');
const env = JSON.parse(raw) as { DATABASE_URL: string; SESSION_SECRET: string };
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.SESSION_SECRET = env.SESSION_SECRET;
process.env.NODE_ENV = 'test';

