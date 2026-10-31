import { withSociety } from '../../db';
import { ApiError } from '../../errors';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp';

const PENDING = 'pending:';
const ACTIVE = 'totp:';

export async function enrollMfa(input: {
  userId: string;
  societyId: string;
  email: string;
  traceId: string;
}): Promise<{ otpauthUri: string }> {
  const secret = generateTotpSecret();
  await withSociety({ userId: input.userId, societyId: input.societyId }, async (tx) => {
    const rows = await tx.$queryRaw<{ app_mfa_factor: string | null }[]>`
      SELECT app_mfa_factor(${input.userId}::uuid) AS app_mfa_factor
    `;
    const current = rows[0]?.app_mfa_factor ?? '';
    if (current.startsWith(ACTIVE)) {
      throw new ApiError(409, 'conflict', 'shell.mfa.already');
    }
    await tx.$executeRaw`SELECT app_set_mfa_factor(${input.userId}::uuid, ${PENDING + secret})`;
    await tx.auditEvent.create({
      data: {
        societyId: input.societyId,
        actorId: input.userId,
        action: 'auth.mfa_enroll_started',
        objectType: 'user',
        objectId: input.userId,
        traceId: input.traceId,
        detail: { factor: 'totp' },
      },
    });
  });
  return { otpauthUri: otpauthUri(secret, input.email) };
}

export async function confirmMfa(input: {
  userId: string;
  societyId: string;
  code: string;
  traceId: string;
}): Promise<void> {
  await withSociety({ userId: input.userId, societyId: input.societyId }, async (tx) => {
    const rows = await tx.$queryRaw<{ app_mfa_factor: string | null }[]>`
      SELECT app_mfa_factor(${input.userId}::uuid) AS app_mfa_factor
    `;
    const current = rows[0]?.app_mfa_factor ?? '';
    if (!current.startsWith(PENDING)) {
      throw new ApiError(409, 'conflict', 'errors.validation');
    }
    const secret = current.slice(PENDING.length);
    if (!verifyTotp(secret, input.code)) {
      throw new ApiError(400, 'validation', 'errors.validation');
    }
    await tx.$executeRaw`SELECT app_set_mfa_factor(${input.userId}::uuid, ${ACTIVE + secret})`;
    await tx.auditEvent.create({
      data: {
        societyId: input.societyId,
        actorId: input.userId,
        action: 'auth.mfa_confirmed',
        objectType: 'user',
        objectId: input.userId,
        traceId: input.traceId,
        detail: { factor: 'totp' },
      },
    });
  });
}

export function activeTotpSecret(factor: string | null): string | null {
  if (!factor?.startsWith(ACTIVE)) return null;
  return factor.slice(ACTIVE.length);
}
