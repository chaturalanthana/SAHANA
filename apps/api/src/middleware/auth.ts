import type { NextFunction, Request, Response } from 'express';
import { sessionById, sessionByTokenHash, withSociety } from '../db';
import { ApiError } from '../errors';
import { hashToken, verifyAccessToken } from '../modules/auth/tokens';

export type Actor = {
  userId: string;
  societyId: string;
  sessionId: string;
  clientKind: 'web' | 'mobile';
  permissions: string[];
  user: {
    id: string;
    email: string;
    displayName: string;
    preferredLanguage: 'en' | 'si' | 'ta' | null;
  };
  society: { id: string; name: string };
};

declare global {
  // Express augments Request through the Express namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      traceId: string;
      actor?: Actor;
    }
  }
}

function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

export async function attachActor(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization');
    const bearer = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
    const cookie = req.cookies?.sahana_session as string | undefined;

    let sessionId: string | null = null;
    let clientKind: 'web' | 'mobile' = 'web';

    if (bearer) {
      try {
        const claims = await verifyAccessToken(bearer);
        const session = await sessionById(claims.sid);
        if (
          !session ||
          session.user_id !== claims.sub ||
          session.society_id !== claims.societyId ||
          session.revoked_at ||
          session.user_status !== 'active' ||
          new Date(session.expires_at).getTime() <= Date.now()
        ) {
          next(new ApiError(401, 'unauthorized', 'errors.unauthorized'));
          return;
        }
        sessionId = session.id;
        clientKind = 'mobile';
      } catch {
        next(new ApiError(401, 'unauthorized', 'errors.unauthorized'));
        return;
      }
    } else if (cookie) {
      const session = await sessionByTokenHash(hashToken(cookie));
      if (
        !session ||
        session.revoked_at ||
        session.user_status !== 'active' ||
        new Date(session.expires_at).getTime() <= Date.now()
      ) {
        next(new ApiError(401, 'unauthorized', 'errors.unauthorized'));
        return;
      }
      sessionId = session.id;
      clientKind = session.client_kind === 'mobile' ? 'mobile' : 'web';
      if (!isSafeMethod(req.method) && req.header('x-sahana-client') !== 'web') {
        next(new ApiError(403, 'forbidden', 'errors.forbidden'));
        return;
      }
    }

    if (!sessionId) {
      next();
      return;
    }

    const session = await sessionById(sessionId);
    if (!session) {
      next(new ApiError(401, 'unauthorized', 'errors.unauthorized'));
      return;
    }

    const scope = { societyId: session.society_id, userId: session.user_id };
    const context = await withSociety(scope, async (tx) => {
      const [user, society, permissions] = await Promise.all([
        tx.user.findUnique({
          where: { id: scope.userId },
          select: { id: true, email: true, displayName: true, preferredLanguage: true, status: true },
        }),
        tx.society.findUnique({ where: { id: scope.societyId }, select: { id: true, name: true } }),
        tx.$queryRaw<{ code: string }[]>`
          SELECT DISTINCT p.code
          FROM society_users su
          JOIN society_user_roles sur ON sur.society_user_id = su.id
          JOIN role_permissions rp ON rp.role_id = sur.role_id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE su.user_id = ${scope.userId}::uuid
            AND su.society_id = ${scope.societyId}::uuid
            AND su.status = 'active'
        `,
      ]);
      return { user, society, permissions };
    });

    if (!context.user || context.user.status !== 'active' || !context.society) {
      next(new ApiError(401, 'unauthorized', 'errors.unauthorized'));
      return;
    }

    const language = context.user.preferredLanguage;
    req.actor = {
      userId: scope.userId,
      societyId: scope.societyId,
      sessionId,
      clientKind,
      permissions: context.permissions.map((row) => row.code),
      user: {
        id: context.user.id,
        email: context.user.email,
        displayName: context.user.displayName,
        preferredLanguage: language === 'en' || language === 'si' || language === 'ta' ? language : null,
      },
      society: context.society,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.actor) {
    next(new ApiError(401, 'unauthorized', 'errors.unauthorized'));
    return;
  }
  next();
}

export function requirePermission(code: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.actor) {
      next(new ApiError(401, 'unauthorized', 'errors.unauthorized'));
      return;
    }
    if (!req.actor.permissions.includes(code)) {
      next(new ApiError(403, 'forbidden', 'errors.forbidden'));
      return;
    }
    next();
  };
}
