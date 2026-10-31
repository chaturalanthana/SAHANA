import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { parsePage } from '@sahana/validation';
import { ApiError } from '../../errors';
import type { Scope } from '../../db';
import {
  addJournalLine,
  addProjectExpense,
  addProjectParticipant,
  addMemberFamily,
  changeMemberStatus,
  createAccount,
  createApprovalDecision,
  createApprovalRequest,
  createApprovalRoute,
  createApprovalStage,
  createClaim,
  listClaimEvents,
  createAppointment,
  createEmergency,
  createGovernanceDocument,
  createMeeting,
  createResolution,
  importMembers,
  createFamilyLink,
  createFamilyMember,
  createJournal,
  createKpi,
  createLoanApplication,
  createLoanVersion,
  generateLoanSchedule,
  payClaim,
  seedChart,
  trialBalance,
  createLookup,
  createMember,
  createNamed,
  createPeriod,
  createSchemeVersion,
  createSuggestion,
  createTemplate,
  decideSuggestion,
  listMembers,
  listWhere,
  getMember,
  memberFamily,
  memberHistory,
  memberSection,
  myMember,
  postJournal,
  refuseEsgResult,
  reverseJournal,
  updateEmergency,
} from './operations.service';

const text = z.string().trim().min(1).max(200);
const longText = z.string().trim().min(1).max(2000);
const money = z.string().regex(/^\d+(\.\d{1,4})?$/);

function actor(req: Request): Scope & { permissions: string[] } {
  if (!req.actor) throw new ApiError(401, 'unauthorized', 'errors.unauthorized');
  return {
    societyId: req.actor.societyId,
    userId: req.actor.userId,
    permissions: req.actor.permissions,
  };
}

function allow(req: Request, code: string): Scope {
  const current = actor(req);
  if (!current.permissions.includes(code)) throw new ApiError(403, 'forbidden', 'errors.forbidden');
  return { societyId: current.societyId, userId: current.userId };
}

function pageOf(req: Request) {
  return parsePage(req.query);
}

async function send(res: Response, next: NextFunction, work: () => Promise<unknown>, status = 200): Promise<void> {
  try {
    const body = await work();
    if (status === 204) res.status(204).end();
    else res.status(status).json(body);
  } catch (error) {
    next(error);
  }
}

export function getMembers(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () => listMembers(allow(req, 'members.read'), page.page, page.pageSize));
}

export function postMember(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({
      memberNo: text,
      givenName: text,
      familyName: text,
      employeeNo: z.string().max(80).optional(),
      department: z.string().max(120).optional(),
      statusCode: text,
      categoryCode: text,
      linkToCurrentUser: z.boolean().optional(),
    })
    .parse(req.body);
  void send(res, next, () => createMember(allow(req, 'members.write'), body, req.traceId), 201);
}

export function postMemberImport(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({
      trial: z.boolean().optional(),
      rows: z
        .array(
          z.object({
            memberNo: z.string().max(80),
            givenName: z.string().max(200),
            familyName: z.string().max(200),
            statusCode: z.string().max(80),
            categoryCode: z.string().max(80),
            employeeNo: z.string().max(80).optional(),
            department: z.string().max(120).optional(),
          }),
        )
        .max(500),
    })
    .parse(req.body);
  void send(
    res,
    next,
    () => importMembers(allow(req, 'members.write'), { trial: body.trial ?? false, rows: body.rows }, req.traceId),
    200,
  );
}

export function getMyMember(req: Request, res: Response, next: NextFunction): void {
  void send(res, next, () => myMember(allow(req, 'members.read')));
}

export function getMemberProfile(req: Request, res: Response, next: NextFunction): void {
  void send(res, next, () => getMember(allow(req, 'members.read'), String(req.params.id)));
}

export function getMemberHistory(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () => memberHistory(allow(req, 'members.read'), String(req.params.id), page.page, page.pageSize));
}

export function postMemberStatus(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ statusCode: text, reason: longText }).parse(req.body);
  void send(res, next, () => changeMemberStatus(allow(req, 'members.write'), String(req.params.id), body, req.traceId), 201);
}

export function getMemberFamily(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () => memberFamily(allow(req, 'members.read'), String(req.params.id), page.page, page.pageSize));
}

export function postMemberFamily(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ givenName: text, familyName: text, relationshipCode: text }).parse(req.body);
  void send(res, next, () => addMemberFamily(allow(req, 'members.write'), String(req.params.id), body, req.traceId), 201);
}

function memberSectionRoute(section: 'claims' | 'loans' | 'projects' | 'emergency', permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const page = pageOf(req);
    void send(res, next, () => memberSection(allow(req, permission), String(req.params.id), section, page.page, page.pageSize));
  };
}

export const getMemberClaims = memberSectionRoute('claims', 'welfare.read');
export const getMemberLoans = memberSectionRoute('loans', 'loans.read');
export const getMemberProjects = memberSectionRoute('projects', 'projects.read');
export const getMemberEmergency = memberSectionRoute('emergency', 'emergency.read');

export function getLookups(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () =>
    listWhere(allow(req, 'members.read'), page.page, page.pageSize, (tx, where) =>
      Promise.all([tx.lookupValue.count({ where }), tx.lookupValue.findMany({ where, take: page.pageSize, skip: (page.page - 1) * page.pageSize })]),
    ),
  );
}

export function postLookup(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ listCode: text, code: text, label: text }).parse(req.body);
  void send(res, next, () => createLookup(allow(req, 'members.write'), body, req.traceId), 201);
}

export function getFamily(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () =>
    listWhere(allow(req, 'members.read'), page.page, page.pageSize, (tx, where) =>
      Promise.all([tx.familyMember.count({ where }), tx.familyMember.findMany({ where, take: page.pageSize, skip: (page.page - 1) * page.pageSize })]),
    ),
  );
}

export function postFamily(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ givenName: text, familyName: text }).parse(req.body);
  void send(res, next, () => createFamilyMember(allow(req, 'members.write'), body, req.traceId), 201);
}

export function postFamilyLink(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({ memberId: z.string().uuid(), familyMemberId: z.string().uuid(), relationshipCode: text })
    .parse(req.body);
  void send(res, next, () => createFamilyLink(allow(req, 'members.write'), body, req.traceId), 201);
}

export function getCommittees(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () =>
    listWhere(allow(req, 'governance.read'), page.page, page.pageSize, (tx, where) =>
      Promise.all([tx.committee.count({ where }), tx.committee.findMany({ where, take: page.pageSize, skip: (page.page - 1) * page.pageSize })]),
    ),
  );
}

export function postCommittee(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ name: text }).parse(req.body);
  void send(res, next, () => createNamed(allow(req, 'governance.write'), 'committee', body, req.traceId), 201);
}

export function postAppointment(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({
      memberId: z.string().uuid(),
      roleTitle: text,
      startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .parse(req.body);
  void send(res, next, () => createAppointment(allow(req, 'governance.write'), String(req.params.id), body, req.traceId), 201);
}

export function postMeeting(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ title: text, heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.body);
  void send(res, next, () => createMeeting(allow(req, 'governance.write'), String(req.params.id), body, req.traceId), 201);
}

export function postResolution(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ title: text }).parse(req.body);
  void send(res, next, () => createResolution(allow(req, 'governance.write'), String(req.params.id), body, req.traceId), 201);
}

export function postGovernanceDocument(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ title: text, language: z.enum(['en', 'si', 'ta']), storageKey: text }).parse(req.body);
  void send(res, next, () => createGovernanceDocument(allow(req, 'governance.write'), body, req.traceId), 201);
}

export function getSchemes(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () =>
    listWhere(allow(req, 'welfare.read'), page.page, page.pageSize, (tx, where) =>
      Promise.all([tx.welfareScheme.count({ where }), tx.welfareScheme.findMany({ where, take: page.pageSize, skip: (page.page - 1) * page.pageSize })]),
    ),
  );
}

export function postScheme(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ name: text }).parse(req.body);
  void send(res, next, () => createNamed(allow(req, 'welfare.write'), 'welfareScheme', body, req.traceId), 201);
}

export function postSchemeVersion(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({
      publish: z.boolean().optional(),
      ruleBody: z.record(z.unknown()).optional(),
    })
    .parse(req.body ?? {});
  void send(
    res,
    next,
    () => createSchemeVersion(allow(req, 'welfare.write'), String(req.params.id), req.traceId, body),
    201,
  );
}

export function getClaims(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () =>
    listWhere(allow(req, 'welfare.read'), page.page, page.pageSize, (tx, where) =>
      Promise.all([tx.claim.count({ where }), tx.claim.findMany({ where, orderBy: { createdAt: 'desc' }, take: page.pageSize, skip: (page.page - 1) * page.pageSize })]),
    ),
  );
}

export function getClaim(req: Request, res: Response, next: NextFunction): void {
  void send(res, next, () => listClaimEvents(allow(req, 'welfare.read'), String(req.params.id)));
}

export function postClaim(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({
      memberId: z.string().uuid(),
      schemeVersionId: z.string().uuid(),
      idempotencyKey: text,
      familyMemberId: z.string().uuid().optional(),
      amount: money.optional(),
      evidenceNote: z.string().max(2000).optional(),
      documents: z.array(z.string().max(80)).max(20).optional(),
      contributionSatisfied: z.boolean().optional(),
    })
    .parse(req.body);
  void send(res, next, () => createClaim(allow(req, 'welfare.write'), body, req.traceId), 201);
}

export function getRoutes(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () =>
    listWhere(allow(req, 'approvals.read'), page.page, page.pageSize, (tx, where) =>
      Promise.all([tx.approvalRoute.count({ where }), tx.approvalRoute.findMany({ where, take: page.pageSize, skip: (page.page - 1) * page.pageSize })]),
    ),
  );
}

export function postRoute(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ name: text }).parse(req.body);
  void send(res, next, () => createApprovalRoute(allow(req, 'approvals.read'), body.name, req.traceId), 201);
}

export function postStage(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ stageNo: z.number().int().min(1).max(3), roleCode: text, amountNote: z.string().max(200).optional() }).parse(req.body);
  void send(res, next, () => createApprovalStage(allow(req, 'approvals.read'), String(req.params.id), body, req.traceId), 201);
}

export function postApprovalRequest(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ objectType: text, objectId: z.string().uuid(), routeId: z.string().uuid().optional() }).parse(req.body);
  void send(res, next, () => createApprovalRequest(allow(req, 'welfare.write'), body, req.traceId), 201);
}

export function postDecision(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ stageNo: z.number().int().min(1).max(3), decision: z.enum(['approve', 'reject', 'return']), reason: longText }).parse(req.body);
  void send(res, next, () => createApprovalDecision(allow(req, 'approvals.decide'), String(req.params.id), body, req.traceId), 201);
}

export function getAccounts(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () =>
    listWhere(allow(req, 'ledger.read'), page.page, page.pageSize, (tx, where) =>
      Promise.all([tx.account.count({ where }), tx.account.findMany({ where, take: page.pageSize, skip: (page.page - 1) * page.pageSize })]),
    ),
  );
}

export function postAccount(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ code: text, name: text, accountType: z.enum(['asset', 'liability', 'equity', 'income', 'expense']) }).parse(req.body);
  void send(res, next, () => createAccount(allow(req, 'ledger.post'), body, req.traceId), 201);
}

export function postPeriod(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ name: text, startsOn: z.string().date(), endsOn: z.string().date() }).parse(req.body);
  void send(res, next, () => createPeriod(allow(req, 'ledger.post'), body, req.traceId), 201);
}

export function getJournals(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () =>
    listWhere(allow(req, 'ledger.read'), page.page, page.pageSize, (tx, where) =>
      Promise.all([tx.journalDocument.count({ where }), tx.journalDocument.findMany({ where, orderBy: { createdAt: 'desc' }, take: page.pageSize, skip: (page.page - 1) * page.pageSize })]),
    ),
  );
}

export function postJournalDocument(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ periodId: z.string().uuid(), reason: longText }).parse(req.body);
  void send(res, next, () => createJournal(allow(req, 'ledger.post'), body, req.traceId), 201);
}

export function postJournalLine(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ accountId: z.string().uuid(), debit: money.optional(), credit: money.optional(), fundId: z.string().uuid().optional() }).parse(req.body);
  void send(res, next, () => addJournalLine(allow(req, 'ledger.post'), String(req.params.id), body, req.traceId), 201);
}

export function postJournalPost(req: Request, res: Response, next: NextFunction): void {
  void send(res, next, async () => {
    await postJournal(allow(req, 'ledger.post'), String(req.params.id), req.traceId);
    return { status: 'posted' };
  });
}

export function postJournalReverse(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ reason: longText }).parse(req.body);
  void send(res, next, () => reverseJournal(allow(req, 'ledger.post'), String(req.params.id), body.reason, req.traceId), 201);
}

export function getLoans(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () =>
    listWhere(allow(req, 'loans.read'), page.page, page.pageSize, (tx, where) =>
      Promise.all([tx.loanProduct.count({ where }), tx.loanProduct.findMany({ where, take: page.pageSize, skip: (page.page - 1) * page.pageSize })]),
    ),
  );
}

export function postLoan(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ name: text }).parse(req.body);
  void send(res, next, () => createNamed(allow(req, 'loans.write'), 'loanProduct', body, req.traceId), 201);
}

export function postLoanVersion(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ publish: z.boolean().optional(), ruleBody: z.record(z.unknown()).optional() }).parse(req.body ?? {});
  void send(res, next, () => createLoanVersion(allow(req, 'loans.write'), String(req.params.id), req.traceId, body), 201);
}

export function postLoanSchedule(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ principal: money, startOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.body);
  void send(res, next, () => generateLoanSchedule(allow(req, 'loans.write'), String(req.params.id), body, req.traceId), 201);
}

export function postChart(req: Request, res: Response, next: NextFunction): void {
  void send(res, next, () => seedChart(allow(req, 'ledger.post'), req.traceId), 201);
}

export function getTrialBalance(req: Request, res: Response, next: NextFunction): void {
  void send(res, next, () => trialBalance(allow(req, 'ledger.read')));
}

export function postPayClaim(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({
      periodId: z.string().uuid(),
      expenseAccountId: z.string().uuid(),
      cashAccountId: z.string().uuid(),
      amount: money,
      reason: longText,
    })
    .parse(req.body);
  void send(res, next, () => payClaim(allow(req, 'ledger.post'), String(req.params.id), body, req.traceId), 200);
}

export function postLoanApplication(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ memberId: z.string().uuid(), productVersionId: z.string().uuid() }).parse(req.body);
  void send(res, next, () => createLoanApplication(allow(req, 'loans.write'), body, req.traceId), 201);
}

export function getProjects(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () =>
    listWhere(allow(req, 'projects.read'), page.page, page.pageSize, (tx, where) =>
      Promise.all([tx.project.count({ where }), tx.project.findMany({ where, take: page.pageSize, skip: (page.page - 1) * page.pageSize })]),
    ),
  );
}

export function postProject(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ name: text, category: text }).parse(req.body);
  void send(res, next, () => createNamed(allow(req, 'projects.write'), 'project', body, req.traceId), 201);
}

export function postProjectParticipant(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ memberId: z.string().uuid(), familyMemberId: z.string().uuid().optional() }).parse(req.body);
  void send(res, next, () => addProjectParticipant(allow(req, 'projects.write'), String(req.params.id), body, req.traceId), 201);
}

export function postProjectExpense(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({
      description: longText,
      amount: money,
      periodId: z.string().uuid().optional(),
      expenseAccountId: z.string().uuid().optional(),
      cashAccountId: z.string().uuid().optional(),
    })
    .parse(req.body);
  const scope = allow(req, 'projects.write');
  if (body.periodId && !actor(req).permissions.includes('ledger.post')) {
    next(new ApiError(403, 'forbidden', 'errors.forbidden'));
    return;
  }
  void send(res, next, () => addProjectExpense(scope, String(req.params.id), body, req.traceId), 201);
}

export function getSuggestions(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () =>
    listWhere(allow(req, 'projects.read'), page.page, page.pageSize, (tx, where) =>
      Promise.all([tx.suggestion.count({ where }), tx.suggestion.findMany({ where, take: page.pageSize, skip: (page.page - 1) * page.pageSize })]),
    ),
  );
}

export function postSuggestion(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ memberId: z.string().uuid(), body: longText }).parse(req.body);
  void send(res, next, () => createSuggestion(allow(req, 'projects.write'), body, req.traceId), 201);
}

export function postSuggestionDecision(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ status: z.enum(['accepted', 'declined', 'later']), projectId: z.string().uuid().optional() }).parse(req.body);
  void send(res, next, () => decideSuggestion(allow(req, 'projects.write'), String(req.params.id), body, req.traceId));
}

export function getEmergency(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  const current = actor(req);
  const canRead = current.permissions.includes('emergency.read');
  const canWrite = current.permissions.includes('emergency.write');
  if (!canRead && !canWrite) {
    next(new ApiError(403, 'forbidden', 'errors.forbidden'));
    return;
  }
  void send(res, next, () =>
    listWhere({ societyId: current.societyId, userId: current.userId }, page.page, page.pageSize, (tx, where) => {
      const filter = canRead ? where : { ...where, createdBy: current.userId };
      return Promise.all([
        tx.emergencyRequest.count({ where: filter }),
        tx.emergencyRequest.findMany({ where: filter, orderBy: { createdAt: 'desc' }, take: page.pageSize, skip: (page.page - 1) * page.pageSize }),
      ]);
    }),
  );
}

export function postEmergency(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({
      memberId: z.string().uuid(),
      requestType: text,
      phone: text,
      description: longText,
      idempotencyKey: text,
    })
    .parse(req.body);
  void send(res, next, () => createEmergency(allow(req, 'emergency.write'), body, req.traceId), 201);
}

export function postEmergencyUpdate(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ note: longText, status: text }).parse(req.body);
  void send(res, next, () => updateEmergency(allow(req, 'emergency.coordinate'), String(req.params.id), body, req.traceId), 201);
}

export function getGoals(req: Request, res: Response, next: NextFunction): void {
  const page = pageOf(req);
  void send(res, next, () =>
    listWhere(allow(req, 'esg.read'), page.page, page.pageSize, (tx, where) =>
      Promise.all([tx.esgGoal.count({ where }), tx.esgGoal.findMany({ where, take: page.pageSize, skip: (page.page - 1) * page.pageSize })]),
    ),
  );
}

export function postGoal(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ name: text }).parse(req.body);
  void send(res, next, () => createNamed(allow(req, 'esg.write'), 'esgGoal', body, req.traceId), 201);
}

export function postKpi(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ name: text, unitLabel: text }).parse(req.body);
  void send(res, next, () => createKpi(allow(req, 'esg.write'), String(req.params.id), body, req.traceId), 201);
}

export function postEsgResult(req: Request, res: Response, next: NextFunction): void {
  try {
    allow(req, 'esg.read');
    refuseEsgResult();
  } catch (error) {
    next(error);
  }
}

export function postTemplate(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({
      code: text,
      language: z.enum(['en', 'si', 'ta']),
      body: longText,
      channel: z.string().optional(),
    })
    .parse(req.body);
  void send(res, next, () => createTemplate(allow(req, 'notifications.write'), body, req.traceId), 201);
}
