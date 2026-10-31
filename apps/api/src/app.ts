import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { readEnv } from './env';
import { ApiError, zodFields } from './errors';
import { log } from './logger';
import { prisma } from './db';
import { attachActor, requireAuth } from './middleware/auth';
import {
  getMe,
  postLanguage,
  postLogin,
  postLogout,
  postMfaConfirm,
  postMfaEnroll,
  postRefresh,
  postSwitchSociety,
} from './modules/auth/auth.routes';
import { getChanges, getConfig, getConsent, postApprove, putConfig } from './modules/config/config.routes';
import { getAudit, getUsers } from './modules/directory/directory.routes';
import {
  getAccounts,
  getClaim,
  getClaims,
  getCommittees,
  getEmergency,
  getFamily,
  getGoals,
  getTrialBalance,
  getJournals,
  getLoans,
  getLookups,
  getMemberClaims,
  getMemberEmergency,
  getMemberFamily,
  getMemberHistory,
  getMemberLoans,
  getMemberProfile,
  getMemberProjects,
  getMembers,
  getMyMember,
  getProjects,
  getRoutes,
  getSchemes,
  getSuggestions,
  postAccount,
  postApprovalRequest,
  postChart,
  postClaim,
  postAppointment,
  postCommittee,
  postGovernanceDocument,
  postMeeting,
  postMemberImport,
  postResolution,
  postDecision,
  postEmergency,
  postEmergencyUpdate,
  postEsgResult,
  postFamily,
  postFamilyLink,
  postGoal,
  postJournalDocument,
  postJournalLine,
  postJournalPost,
  postJournalReverse,
  postKpi,
  postLoan,
  postLoanApplication,
  postLoanSchedule,
  postLoanVersion,
  postPayClaim,
  postLookup,
  postMember,
  postMemberFamily,
  postMemberStatus,
  postPeriod,
  postProject,
  postProjectExpense,
  postProjectParticipant,
  postRoute,
  postScheme,
  postSchemeVersion,
  postStage,
  postSuggestion,
  postSuggestionDecision,
  postTemplate,
} from './modules/operations/operations.routes';

export function createApp() {
  const app = express();
  const env = readEnv();
  const safe =
    (handler: (req: Request, res: Response, next: NextFunction) => void) =>
    (req: Request, res: Response, next: NextFunction) => {
      try {
        handler(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.traceId = randomUUID();
    res.setHeader('x-trace-id', req.traceId);
    const started = Date.now();
    res.on('finish', () => {
      log('info', 'request', {
        traceId: req.traceId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - started,
        societyId: req.actor?.societyId ?? null,
        actorId: req.actor?.userId ?? null,
      });
    });
    next();
  });

  app.get('/api/v1/health', async (_req, res, next) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/version', (_req, res) => {
    res.json({ version: process.env.GIT_SHA ?? '0.1.0' });
  });

  app.post('/api/v1/auth/login', postLogin);
  app.post('/api/v1/auth/refresh', postRefresh);

  app.use(attachActor);
  app.post('/api/v1/auth/logout', requireAuth, postLogout);
  app.get('/api/v1/me', requireAuth, getMe);
  app.post('/api/v1/me/language', requireAuth, postLanguage);
  app.post('/api/v1/me/mfa/enroll', requireAuth, postMfaEnroll);
  app.post('/api/v1/me/mfa/confirm', requireAuth, postMfaConfirm);
  app.post('/api/v1/session/society', requireAuth, postSwitchSociety);
  app.get('/api/v1/config', requireAuth, getConfig);
  app.put('/api/v1/config/:key', requireAuth, putConfig);
  app.get('/api/v1/config/changes', requireAuth, getChanges);
  app.post('/api/v1/config/changes/:id/approve', requireAuth, postApprove);
  app.get('/api/v1/consent', requireAuth, getConsent);
  app.get('/api/v1/users', requireAuth, getUsers);
  app.get('/api/v1/audit', requireAuth, getAudit);
  app.get('/api/v1/lookups', requireAuth, safe(getLookups));
  app.post('/api/v1/lookups', requireAuth, safe(postLookup));
  app.get('/api/v1/members', requireAuth, safe(getMembers));
  app.post('/api/v1/members', requireAuth, safe(postMember));
  app.post('/api/v1/members/import', requireAuth, safe(postMemberImport));
  app.get('/api/v1/members/me', requireAuth, safe(getMyMember));
  app.get('/api/v1/members/:id', requireAuth, safe(getMemberProfile));
  app.get('/api/v1/members/:id/history', requireAuth, safe(getMemberHistory));
  app.post('/api/v1/members/:id/status', requireAuth, safe(postMemberStatus));
  app.get('/api/v1/members/:id/family', requireAuth, safe(getMemberFamily));
  app.post('/api/v1/members/:id/family', requireAuth, safe(postMemberFamily));
  app.get('/api/v1/members/:id/claims', requireAuth, safe(getMemberClaims));
  app.get('/api/v1/members/:id/loans', requireAuth, safe(getMemberLoans));
  app.get('/api/v1/members/:id/projects', requireAuth, safe(getMemberProjects));
  app.get('/api/v1/members/:id/emergency-requests', requireAuth, safe(getMemberEmergency));
  app.get('/api/v1/family-members', requireAuth, safe(getFamily));
  app.post('/api/v1/family-members', requireAuth, safe(postFamily));
  app.post('/api/v1/family-links', requireAuth, safe(postFamilyLink));
  app.get('/api/v1/committees', requireAuth, safe(getCommittees));
  app.post('/api/v1/committees', requireAuth, safe(postCommittee));
  app.post('/api/v1/committees/:id/appointments', requireAuth, safe(postAppointment));
  app.post('/api/v1/committees/:id/meetings', requireAuth, safe(postMeeting));
  app.post('/api/v1/meetings/:id/resolutions', requireAuth, safe(postResolution));
  app.post('/api/v1/governance-documents', requireAuth, safe(postGovernanceDocument));
  app.get('/api/v1/welfare-schemes', requireAuth, safe(getSchemes));
  app.post('/api/v1/welfare-schemes', requireAuth, safe(postScheme));
  app.post('/api/v1/welfare-schemes/:id/versions', requireAuth, safe(postSchemeVersion));
  app.get('/api/v1/claims', requireAuth, safe(getClaims));
  app.get('/api/v1/claims/:id', requireAuth, safe(getClaim));
  app.post('/api/v1/claims', requireAuth, safe(postClaim));
  app.post('/api/v1/claims/:id/pay', requireAuth, safe(postPayClaim));
  app.get('/api/v1/approval-routes', requireAuth, safe(getRoutes));
  app.post('/api/v1/approval-routes', requireAuth, safe(postRoute));
  app.post('/api/v1/approval-routes/:id/stages', requireAuth, safe(postStage));
  app.post('/api/v1/approval-requests', requireAuth, safe(postApprovalRequest));
  app.post('/api/v1/approval-requests/:id/decisions', requireAuth, safe(postDecision));
  app.get('/api/v1/accounts', requireAuth, safe(getAccounts));
  app.post('/api/v1/accounts', requireAuth, safe(postAccount));
  app.post('/api/v1/ledger/chart', requireAuth, safe(postChart));
  app.get('/api/v1/reports/trial-balance', requireAuth, safe(getTrialBalance));
  app.post('/api/v1/fiscal-periods', requireAuth, safe(postPeriod));
  app.get('/api/v1/journal-documents', requireAuth, safe(getJournals));
  app.post('/api/v1/journal-documents', requireAuth, safe(postJournalDocument));
  app.post('/api/v1/journal-documents/:id/lines', requireAuth, safe(postJournalLine));
  app.post('/api/v1/journal-documents/:id/post', requireAuth, safe(postJournalPost));
  app.post('/api/v1/journal-documents/:id/reverse', requireAuth, safe(postJournalReverse));
  app.get('/api/v1/loan-products', requireAuth, safe(getLoans));
  app.post('/api/v1/loan-products', requireAuth, safe(postLoan));
  app.post('/api/v1/loan-products/:id/versions', requireAuth, safe(postLoanVersion));
  app.post('/api/v1/loan-applications', requireAuth, safe(postLoanApplication));
  app.post('/api/v1/loan-applications/:id/schedule', requireAuth, safe(postLoanSchedule));
  app.get('/api/v1/projects', requireAuth, safe(getProjects));
  app.post('/api/v1/projects', requireAuth, safe(postProject));
  app.post('/api/v1/projects/:id/participants', requireAuth, safe(postProjectParticipant));
  app.post('/api/v1/projects/:id/expenses', requireAuth, safe(postProjectExpense));
  app.get('/api/v1/suggestions', requireAuth, safe(getSuggestions));
  app.post('/api/v1/suggestions', requireAuth, safe(postSuggestion));
  app.post('/api/v1/suggestions/:id/decision', requireAuth, safe(postSuggestionDecision));
  app.get('/api/v1/emergency-requests', requireAuth, safe(getEmergency));
  app.post('/api/v1/emergency-requests', requireAuth, safe(postEmergency));
  app.post('/api/v1/emergency-requests/:id/updates', requireAuth, safe(postEmergencyUpdate));
  app.get('/api/v1/esg-goals', requireAuth, safe(getGoals));
  app.post('/api/v1/esg-goals', requireAuth, safe(postGoal));
  app.post('/api/v1/esg-goals/:id/kpis', requireAuth, safe(postKpi));
  app.post('/api/v1/esg/results', requireAuth, safe(postEsgResult));
  app.post('/api/v1/notification-templates', requireAuth, safe(postTemplate));

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        code: 'validation',
        messageKey: 'errors.validation',
        fields: zodFields(error),
        traceId: req.traceId,
      });
      return;
    }
    if (error instanceof ApiError) {
      res.status(error.status).json({
        code: error.code,
        messageKey: error.messageKey,
        fields: error.fields,
        choices: error.choices,
        traceId: req.traceId,
      });
      return;
    }
    log('error', 'unhandled error', { traceId: req.traceId, name: error instanceof Error ? error.name : 'unknown' });
    res.status(500).json({ code: 'internal', messageKey: 'errors.generic', traceId: req.traceId });
  });

  return app;
}
