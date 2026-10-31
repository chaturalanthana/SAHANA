import type { NextFunction, Request, Response } from 'express';
import { configWriteSchema } from '@sahana/validation';
import { ApiError } from '../../errors';
import { requirePermission } from '../../middleware/auth';
import { approveChange, listConsent, listPendingChanges, readPublicConfig, writeConfig } from './config.service';

function scope(req: Request) {
  if (!req.actor) throw new ApiError(401, 'unauthorized', 'errors.unauthorized');
  return { societyId: req.actor.societyId, userId: req.actor.userId };
}

export async function getConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requirePermission('config.read')(req, res, (error?: unknown) => {
      if (error) next(error);
    });
    if (!req.actor?.permissions.includes('config.read')) return;
    const config = await readPublicConfig(scope(req));
    res.json(config);
  } catch (error) {
    next(error);
  }
}

export async function putConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.actor?.permissions.includes('config.write')) {
      throw new ApiError(403, 'forbidden', 'config.error.forbidden');
    }
    const body = configWriteSchema.parse(req.body);
    const key = String(req.params.key ?? '');
    const saved = await writeConfig(scope(req), key, body.value, body.reason, req.traceId);
    res.status(saved.status === 'pending' ? 202 : 200).json(saved);
  } catch (error) {
    next(error);
  }
}

export async function getChanges(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.actor?.permissions.includes('config.read')) {
      throw new ApiError(403, 'forbidden', 'errors.forbidden');
    }
    const items = await listPendingChanges(scope(req));
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

export async function postApprove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.actor?.permissions.includes('config.approve')) {
      throw new ApiError(403, 'forbidden', 'errors.forbidden');
    }
    await approveChange(scope(req), String(req.params.id ?? ''), req.traceId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function getConsent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.actor?.permissions.includes('config.read')) {
      throw new ApiError(403, 'forbidden', 'errors.forbidden');
    }
    const documents = await listConsent(scope(req));
    res.json({ documents });
  } catch (error) {
    next(error);
  }
}
