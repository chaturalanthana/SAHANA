const secretKeys = ['password', 'token', 'secret', 'authorization'];

export function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  fields: Record<string, unknown> = {},
): void {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (secretKeys.some((secret) => key.toLowerCase().includes(secret))) continue;
    safe[key] = value;
  }
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...safe,
    }),
  );
}
