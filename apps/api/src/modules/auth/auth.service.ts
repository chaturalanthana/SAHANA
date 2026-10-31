import type { Response } from 'express';
import { isLocale } from '@sahana/i18n';
import type { SessionSociety, SessionUser } from '@sahana/types';
import {
  DEFAULT_LOGIN_RATE_LIMIT,
  LOGIN_RATE_LIMIT_KEY,
  LOGIN_RATE_WINDOW_MS,
} from '@sahana/validation';
import {
  createSession,
  findUserByEmail,
  membershipsForUser,
  platformConfig,
  recordLoginFailure,
  revokeSession,
  sessionByTokenHash,
  withSociety,
} from '../../db';
import { readEnv } from '../../env';
import { ApiError } from '../../errors';
import { verifyPassword } from './passwords';
import { consumeLoginAttempt } from './rate-limit';
import {
  ACCESS_TOKEN_SECONDS,
  MOBILE_REFRESH_MS,
  WEB_SESSION_MS,
  hashToken,
  newToken,
  signAccessToken,
} from './tokens';

export type LoginInput = {
  email: string;
  password: string;
  societyId?: string;
  client: 'web' | 'mobile';
  traceId: string;
  ip: string;
};

export type AccountView = {
  user: SessionUser;
  society: SessionSociety;
};

export type LoginResult =
  | { kind: 'society_required'; societies: SessionSociety[] }
  | ({ kind: 'web'; token: string } & AccountView)
  | ({
      kind: 'mobile';
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    } & AccountView);

async function loginLimit(): Promise<number> {
  const raw = await platformConfig(LOGIN_RATE_LIMIT_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LOGIN_RATE_LIMIT;
  return Math.floor(parsed);
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const limit = await loginLimit();
  if (!consumeLoginAttempt(input.ip, limit, LOGIN_RATE_WINDOW_MS)) {
    throw new ApiError(429, 'rate_limited', 'errors.rateLimited');
  }

  const user = await findUserByEmail(input.email);
  const passwordOk = user ? await verifyPassword(user.password_hash, input.password) : false;
  if (!user || !passwordOk || user.status !== 'active') {
    await recordLoginFailure(input.email, input.traceId);
    throw new ApiError(401, 'unauthorized', 'auth.signIn.failed');
  }

  const memberships = (await membershipsForUser(user.id)).filter((row) => row.status === 'active');
  if (input.societyId && !memberships.some((row) => row.society_id === input.societyId)) {
    throw new ApiError(403, 'forbidden', 'errors.forbidden');
  }

  let societyId = input.societyId;
  if (!societyId) {
    if (memberships.length !== 1) {
      return {
        kind: 'society_required',
        societies: memberships.map((row) => ({ id: row.society_id, name: row.society_name })),
      };
    }
    societyId = memberships[0]?.society_id;
  }
  const society = memberships.find((row) => row.society_id === societyId);
  if (!societyId || !society) throw new ApiError(403, 'forbidden', 'errors.forbidden');

  const opened = await openSession({
    userId: user.id,
    societyId,
    client: input.client,
    traceId: input.traceId,
  });
  const view: AccountView = {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      preferredLanguage: isLocale(user.preferred_language) ? user.preferred_language : null,
    },
    society: { id: society.society_id, name: society.society_name },
  };
  if (input.client === 'web') return { kind: 'web', token: opened.refreshToken, ...view };
  return {
    kind: 'mobile',
    accessToken: opened.accessToken,
    refreshToken: opened.refreshToken,
    expiresIn: ACCESS_TOKEN_SECONDS,
    ...view,
  };
}

async function openSession(input: {
  userId: string;
  societyId: string;
  client: 'web' | 'mobile';
  traceId: string;
}): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const refreshToken = newToken();
  const expiresAt = new Date(
    Date.now() + (input.client === 'web' ? WEB_SESSION_MS : MOBILE_REFRESH_MS),
  );
  const sessionId = await createSession({
    userId: input.userId,
    societyId: input.societyId,
    tokenHash: hashToken(refreshToken),
    clientKind: input.client,
    expiresAt,
  });
  await withSociety({ societyId: input.societyId, userId: input.userId }, async (tx) => {
    await tx.auditEvent.create({
      data: {
        societyId: input.societyId,
        actorId: input.userId,
        action: 'auth.login_succeeded',
        objectType: 'session',
        objectId: sessionId,
        traceId: input.traceId,
        detail: { client: input.client },
      },
    });
  });
  const accessToken = await signAccessToken({
    sub: input.userId,
    sid: sessionId,
    societyId: input.societyId,
  });
  return { accessToken, refreshToken, sessionId };
}

export async function refreshMobileSession(
  refreshToken: string,
  traceId: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const current = await sessionByTokenHash(hashToken(refreshToken));
  if (
    !current ||
    current.revoked_at ||
    current.user_status !== 'active' ||
    current.client_kind !== 'mobile'
  ) {
    throw new ApiError(401, 'unauthorized', 'errors.unauthorized');
  }
  if (new Date(current.expires_at).getTime() <= Date.now()) {
    throw new ApiError(401, 'unauthorized', 'errors.unauthorized');
  }
  await revokeSession(current.id);
  const opened = await openSession({
    userId: current.user_id,
    societyId: current.society_id,
    client: 'mobile',
    traceId,
  });
  return {
    accessToken: opened.accessToken,
    refreshToken: opened.refreshToken,
    expiresIn: ACCESS_TOKEN_SECONDS,
  };
}

export async function logout(sessionId: string): Promise<void> {
  await revokeSession(sessionId);
}

export async function switchSociety(input: {
  userId: string;
  sessionId: string;
  societyId: string;
  client: 'web' | 'mobile';
  traceId: string;
}): Promise<{ token: string; accessToken: string; society: SessionSociety }> {
  const memberships = await membershipsForUser(input.userId);
  const society = memberships.find(
    (row) => row.society_id === input.societyId && row.status === 'active',
  );
  if (!society) throw new ApiError(403, 'forbidden', 'errors.forbidden');
  await revokeSession(input.sessionId);
  const opened = await openSession({
    userId: input.userId,
    societyId: input.societyId,
    client: input.client,
    traceId: input.traceId,
  });
  await withSociety({ societyId: input.societyId, userId: input.userId }, async (tx) => {
    await tx.auditEvent.create({
      data: {
        societyId: input.societyId,
        actorId: input.userId,
        action: 'session.society_switch',
        objectType: 'session',
        objectId: opened.sessionId,
        traceId: input.traceId,
        detail: {},
      },
    });
  });
  return {
    token: opened.refreshToken,
    accessToken: opened.accessToken,
    society: { id: society.society_id, name: society.society_name },
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie('sahana_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: readEnv().nodeEnv === 'production',
    path: '/',
    maxAge: WEB_SESSION_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie('sahana_session', { path: '/' });
}

export async function updatePreferredLanguage(input: {
  userId: string;
  societyId: string;
  language: 'en' | 'si' | 'ta';
}): Promise<void> {
  await withSociety({ userId: input.userId, societyId: input.societyId }, async (tx) => {
    await tx.$executeRaw`
      UPDATE users
      SET preferred_language = ${input.language},
          updated_at = now(),
          updated_by = ${input.userId}::uuid
      WHERE id = ${input.userId}::uuid
    `;
  });
}
