import { PrismaClient, type Prisma } from '@prisma/client';
import { loadEnvFiles } from './env';

loadEnvFiles();

const globalForPrisma = globalThis as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type Scope = { societyId: string; userId: string };

export async function asAppRole<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE sahana_app');
    return fn(tx);
  });
}

export async function withSociety<T>(
  scope: Scope,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE sahana_app');
    await tx.$executeRaw`SELECT set_config('app.society_id', ${scope.societyId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', ${scope.userId}, true)`;
    return fn(tx);
  });
}

export type AuthUserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  status: string;
  preferred_language: string | null;
};

export type MembershipRow = {
  society_id: string;
  society_name: string;
  status: string;
};

export type SessionRow = {
  id: string;
  user_id: string;
  society_id: string;
  client_kind: string;
  expires_at: Date;
  revoked_at: Date | null;
  user_status: string;
};

export async function findUserByEmail(email: string): Promise<AuthUserRow | null> {
  return asAppRole(async (tx) => {
    const rows = await tx.$queryRaw<AuthUserRow[]>`
      SELECT * FROM app_auth_user_by_email(${email})
    `;
    return rows[0] ?? null;
  });
}

export async function membershipsForUser(userId: string): Promise<MembershipRow[]> {
  return asAppRole(async (tx) => {
    return tx.$queryRaw<MembershipRow[]>`
      SELECT * FROM app_memberships_for_user(${userId}::uuid)
    `;
  });
}

export async function createSession(input: {
  userId: string;
  societyId: string;
  tokenHash: string;
  clientKind: 'web' | 'mobile';
  expiresAt: Date;
}): Promise<string> {
  return asAppRole(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT app_create_session(
        ${input.userId}::uuid,
        ${input.societyId}::uuid,
        ${input.tokenHash},
        ${input.clientKind},
        ${input.expiresAt}::timestamptz
      ) AS id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error('session was not created');
    return id;
  });
}

export async function sessionByTokenHash(tokenHash: string): Promise<SessionRow | null> {
  return asAppRole(async (tx) => {
    const rows = await tx.$queryRaw<SessionRow[]>`
      SELECT * FROM app_session_by_token_hash(${tokenHash})
    `;
    return rows[0] ?? null;
  });
}

export async function sessionById(id: string): Promise<SessionRow | null> {
  return asAppRole(async (tx) => {
    const rows = await tx.$queryRaw<SessionRow[]>`
      SELECT * FROM app_session_by_id(${id}::uuid)
    `;
    return rows[0] ?? null;
  });
}

export async function revokeSession(id: string): Promise<void> {
  await asAppRole(async (tx) => {
    await tx.$executeRaw`SELECT app_revoke_session(${id}::uuid)`;
  });
}

export async function platformConfig(key: string): Promise<string | null> {
  return asAppRole(async (tx) => {
    const rows = await tx.$queryRaw<{ value: string | null }[]>`
      SELECT app_platform_config(${key}) AS value
    `;
    return rows[0]?.value ?? null;
  });
}

export async function recordLoginFailure(email: string, traceId: string): Promise<void> {
  await asAppRole(async (tx) => {
    await tx.$executeRaw`SELECT app_audit_login_failure(${email}, ${traceId})`;
  });
}
