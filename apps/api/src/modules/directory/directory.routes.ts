import type { NextFunction, Request, Response } from 'express';
import { parsePage } from '@sahana/validation';
import { withSociety } from '../../db';
import { ApiError } from '../../errors';

export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.actor?.permissions.includes('users.read')) {
      throw new ApiError(403, 'forbidden', 'errors.forbidden');
    }
    const pageQuery = parsePage({ page: req.query.page, pageSize: req.query.pageSize });
    const scope = { societyId: req.actor.societyId, userId: req.actor.userId };
    const result = await withSociety(scope, async (tx) => {
      const where = { memberships: { some: { societyId: scope.societyId, status: 'active' } } };
      const [total, items] = await Promise.all([
        tx.user.count({ where }),
        tx.user.findMany({
          where,
          orderBy: { email: 'asc' },
          skip: (pageQuery.page - 1) * pageQuery.pageSize,
          take: pageQuery.pageSize,
          select: { id: true, email: true, displayName: true, status: true },
        }),
      ]);
      return { total, items };
    });
    res.json({ page: pageQuery.page, pageSize: pageQuery.pageSize, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.actor?.permissions.includes('audit.read')) {
      throw new ApiError(403, 'forbidden', 'errors.forbidden');
    }
    const pageQuery = parsePage({ page: req.query.page, pageSize: req.query.pageSize });
    const scope = { societyId: req.actor.societyId, userId: req.actor.userId };
    const result = await withSociety(scope, async (tx) => {
      const where = { societyId: scope.societyId };
      const [total, rows] = await Promise.all([
        tx.auditEvent.count({ where }),
        tx.auditEvent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (pageQuery.page - 1) * pageQuery.pageSize,
          take: pageQuery.pageSize,
        }),
      ]);
      return {
        total,
        items: rows.map((row) => ({
          id: row.id,
          action: row.action,
          objectType: row.objectType,
          objectId: row.objectId,
          actorId: row.actorId,
          createdAt: row.createdAt.toISOString(),
          detail: scrub(row.detail),
        })),
      };
    });
    res.json({ page: pageQuery.page, pageSize: pageQuery.pageSize, ...result });
  } catch (error) {
    next(error);
  }
}

function scrub(detail: unknown): unknown {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (/password|secret|token/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}
