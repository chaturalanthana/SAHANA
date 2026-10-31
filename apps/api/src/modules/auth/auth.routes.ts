import type { NextFunction, Request, Response } from 'express';
import { languageBodySchema, loginBodySchema, mfaCodeSchema, refreshBodySchema, switchSocietySchema } from '@sahana/validation';
import { ZodError } from 'zod';
import { ApiError } from '../../errors';
import {
  clearSessionCookie,
  login,
  logout,
  refreshMobileSession,
  setSessionCookie,
  switchSociety,
  updatePreferredLanguage,
} from './auth.service';
import { confirmMfa, enrollMfa } from './mfa';

function clientKind(req: Request): 'web' | 'mobile' {
  return req.actor?.clientKind ?? 'web';
}

export async function postLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = loginBodySchema.parse(req.body);
    const result = await login({
      ...body,
      traceId: req.traceId,
      ip: req.ip ?? 'unknown',
    });
    if (result.kind === 'society_required') {
      res.status(409).json({
        code: 'society_required',
        messageKey: 'auth.signIn.chooseSociety',
        choices: result.societies,
        traceId: req.traceId,
      });
      return;
    }
    if (result.kind === 'web') {
      setSessionCookie(res, result.token);
      res.json({ user: result.user, society: result.society });
      return;
    }
    res.json({
      user: result.user,
      society: result.society,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    next(error);
  }
}

export async function postRefresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = refreshBodySchema.parse(req.body);
    const tokens = await refreshMobileSession(body.refreshToken, req.traceId);
    res.json(tokens);
  } catch (error) {
    next(error);
  }
}

export async function postLogout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.actor) throw new ApiError(401, 'unauthorized', 'errors.unauthorized');
    await logout(req.actor.sessionId);
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.actor) throw new ApiError(401, 'unauthorized', 'errors.unauthorized');
    res.json({
      user: req.actor.user,
      society: req.actor.society,
      permissions: req.actor.permissions,
    });
  } catch (error) {
    next(error);
  }
}

export async function postMfaEnroll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.actor) throw new ApiError(401, 'unauthorized', 'errors.unauthorized');
    const enrolled = await enrollMfa({
      userId: req.actor.userId,
      societyId: req.actor.societyId,
      email: req.actor.user.email,
      traceId: req.traceId,
    });
    res.status(201).json(enrolled);
  } catch (error) {
    next(error);
  }
}

export async function postMfaConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.actor) throw new ApiError(401, 'unauthorized', 'errors.unauthorized');
    const body = mfaCodeSchema.parse(req.body);
    await confirmMfa({
      userId: req.actor.userId,
      societyId: req.actor.societyId,
      code: body.code,
      traceId: req.traceId,
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function postLanguage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.actor) throw new ApiError(401, 'unauthorized', 'errors.unauthorized');
    const body = languageBodySchema.parse(req.body);
    await updatePreferredLanguage({
      userId: req.actor.userId,
      societyId: req.actor.societyId,
      language: body.language,
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function postSwitchSociety(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.actor) throw new ApiError(401, 'unauthorized', 'errors.unauthorized');
    const body = switchSocietySchema.parse(req.body);
    const switched = await switchSociety({
      userId: req.actor.userId,
      sessionId: req.actor.sessionId,
      societyId: body.societyId,
      client: clientKind(req),
      traceId: req.traceId,
    });
    if (req.actor.clientKind === 'web') setSessionCookie(res, switched.token);
    res.json({
      society: switched.society,
      accessToken: req.actor.clientKind === 'mobile' ? switched.accessToken : undefined,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      next(error);
      return;
    }
    next(error);
  }
}
