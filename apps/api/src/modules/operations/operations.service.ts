import { Prisma } from '@prisma/client';
import type { Page } from '@sahana/types';
import { withSociety, type Scope } from '../../db';
import {
  DEFAULT_MEMBER_CATEGORIES,
  DEFAULT_RELATIONSHIPS,
  knownCode,
  memberStatusAllowed,
} from '../../domain/members';
import { calculateEsg, type EsgMeasure, type EsgSource } from '../../domain/esg';
import { DEFAULT_LOAN_RULE, buildSchedule, parseLoanRule } from '../../domain/loans';
import { DEFAULT_WELFARE_RULE, evaluateWelfare, parseWelfareRule } from '../../domain/welfare';
import { ApiError } from '../../errors';

function present(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10).length === 10 && value.toISOString().endsWith('T00:00:00.000Z')
    ? value.toISOString().slice(0, 10)
    : value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  return value;
}

function row(input: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, present(value)]));
}

async function audit(
  tx: Prisma.TransactionClient,
  scope: Scope,
  action: string,
  objectType: string,
  objectId: string,
  traceId: string,
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      societyId: scope.societyId,
      actorId: scope.userId,
      action,
      objectType,
      objectId,
      traceId,
      detail: {},
    },
  });
}

async function paged(
  scope: Scope,
  page: number,
  pageSize: number,
  load: (tx: Prisma.TransactionClient) => Promise<[number, object[]]>,
): Promise<Page<Record<string, unknown>>> {
  const [total, items] = await withSociety(scope, load);
  return { page, pageSize, total, items: items.map((item) => row(item)) };
}

export async function listMembers(scope: Scope, page: number, pageSize: number) {
  return paged(scope, page, pageSize, async (tx) => {
    const where = { societyId: scope.societyId };
    return Promise.all([
      tx.member.count({ where }),
      tx.member.findMany({ where, orderBy: { memberNo: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
  });
}

async function lookupCodes(tx: Prisma.TransactionClient, societyId: string, listCode: string): Promise<string[]> {
  const rows = await tx.lookupValue.findMany({ where: { societyId, listCode }, select: { code: true } });
  return rows.map((item) => item.code);
}

export async function createMember(
  scope: Scope,
  input: {
    memberNo: string;
    givenName: string;
    familyName: string;
    employeeNo?: string;
    department?: string;
    statusCode: string;
    categoryCode: string;
    linkToCurrentUser?: boolean;
  },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const [statusCodes, categoryCodes] = await Promise.all([
      lookupCodes(tx, scope.societyId, 'member_status'),
      lookupCodes(tx, scope.societyId, 'member_category'),
    ]);
    if (!memberStatusAllowed(input.statusCode, null, statusCodes)) {
      throw new ApiError(422, 'rule_rejected', 'errors.validation');
    }
    if (!knownCode(input.categoryCode, DEFAULT_MEMBER_CATEGORIES, categoryCodes)) {
      throw new ApiError(422, 'rule_rejected', 'errors.validation');
    }
    const created = await tx.member.create({
      data: {
        societyId: scope.societyId,
        userId: input.linkToCurrentUser ? scope.userId : null,
        memberNo: input.memberNo,
        givenName: input.givenName,
        familyName: input.familyName,
        employeeNo: input.employeeNo ?? '',
        department: input.department ?? '',
        statusCode: input.statusCode,
        categoryCode: input.categoryCode,
        createdBy: scope.userId,
        updatedBy: scope.userId,
      },
    });
    await tx.memberStatusHistory.create({
      data: {
        societyId: scope.societyId,
        memberId: created.id,
        statusCode: input.statusCode,
        reason: 'Recorded',
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'members.created', 'member', created.id, traceId);
    return row(created);
  });
}

export async function myChannel(scope: Scope) {
  return withSociety(scope, async (tx) => {
    const member = await tx.member.findFirst({ where: { societyId: scope.societyId, userId: scope.userId } });
    if (!member) return { member: null, claims: [], emergencies: [], family: [] };
    const [claims, emergencies, family] = await Promise.all([
      tx.claim.findMany({ where: { societyId: scope.societyId, memberId: member.id }, orderBy: { createdAt: 'desc' }, take: 25 }),
      tx.emergencyRequest.findMany({
        where: { societyId: scope.societyId, memberId: member.id },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: { id: true, requestType: true, status: true, phone: true, createdAt: true },
      }),
      tx.memberFamilyLink.findMany({ where: { societyId: scope.societyId, memberId: member.id }, take: 25 }),
    ]);
    return {
      member: row(member),
      claims: claims.map((item) => row(item)),
      emergencies: emergencies.map((item) => row(item)),
      family: family.map((item) => ({ id: item.id, relationshipCode: item.relationshipCode })),
    };
  });
}

export async function myMember(scope: Scope) {
  return withSociety(scope, async (tx) => {
    const member = await tx.member.findFirst({ where: { societyId: scope.societyId, userId: scope.userId } });
    if (!member) throw new ApiError(404, 'not_found', 'errors.notFound');
    return row(member);
  });
}

async function requireMember(tx: Prisma.TransactionClient, scope: Scope, memberId: string) {
  const member = await tx.member.findFirst({ where: { id: memberId, societyId: scope.societyId } });
  if (!member) throw new ApiError(404, 'not_found', 'errors.notFound');
  return member;
}

export async function getMember(scope: Scope, memberId: string) {
  return withSociety(scope, async (tx) => row(await requireMember(tx, scope, memberId)));
}

export async function memberHistory(scope: Scope, memberId: string, page: number, pageSize: number) {
  return withSociety(scope, async (tx) => {
    await requireMember(tx, scope, memberId);
    const where = { societyId: scope.societyId, memberId };
    const [total, items] = await Promise.all([
      tx.memberStatusHistory.count({ where }),
      tx.memberStatusHistory.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { page, pageSize, total, items: items.map((item) => row(item)) };
  });
}

export async function changeMemberStatus(
  scope: Scope,
  memberId: string,
  input: { statusCode: string; reason: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const member = await requireMember(tx, scope, memberId);
    const statusCodes = await lookupCodes(tx, scope.societyId, 'member_status');
    if (!memberStatusAllowed(input.statusCode, member.statusCode, statusCodes)) {
      throw new ApiError(422, 'rule_rejected', 'errors.validation');
    }
    await tx.memberStatusHistory.create({
      data: {
        societyId: scope.societyId,
        memberId,
        statusCode: input.statusCode,
        reason: input.reason,
        createdBy: scope.userId,
      },
    });
    const updated = await tx.member.update({
      where: { id: memberId },
      data: { statusCode: input.statusCode, updatedBy: scope.userId },
    });
    await audit(tx, scope, 'members.status_recorded', 'member', memberId, traceId);
    return row(updated);
  });
}

export async function memberFamily(scope: Scope, memberId: string, page: number, pageSize: number) {
  return withSociety(scope, async (tx) => {
    await requireMember(tx, scope, memberId);
    const where = { societyId: scope.societyId, memberId };
    const [total, links] = await Promise.all([
      tx.memberFamilyLink.count({ where }),
      tx.memberFamilyLink.findMany({ where, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const people = await tx.familyMember.findMany({
      where: { societyId: scope.societyId, id: { in: links.map((link) => link.familyMemberId) } },
    });
    const names = new Map(people.map((person) => [person.id, person]));
    return {
      page,
      pageSize,
      total,
      items: links.map((link) => ({
        id: link.id,
        relationshipCode: link.relationshipCode,
        givenName: names.get(link.familyMemberId)?.givenName ?? '',
        familyName: names.get(link.familyMemberId)?.familyName ?? '',
      })),
    };
  });
}

export async function addMemberFamily(
  scope: Scope,
  memberId: string,
  input: { givenName: string; familyName: string; relationshipCode: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    await requireMember(tx, scope, memberId);
    const relationships = await lookupCodes(tx, scope.societyId, 'family_relationship');
    if (!knownCode(input.relationshipCode, DEFAULT_RELATIONSHIPS, relationships)) {
      throw new ApiError(422, 'rule_rejected', 'errors.validation');
    }
    const person = await tx.familyMember.create({
      data: {
        societyId: scope.societyId,
        givenName: input.givenName,
        familyName: input.familyName,
        createdBy: scope.userId,
      },
    });
    const link = await tx.memberFamilyLink.create({
      data: {
        societyId: scope.societyId,
        memberId,
        familyMemberId: person.id,
        relationshipCode: input.relationshipCode,
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'family.linked', 'member_family_link', link.id, traceId);
    return { id: link.id, relationshipCode: link.relationshipCode, givenName: person.givenName, familyName: person.familyName };
  });
}

export async function memberSection(
  scope: Scope,
  memberId: string,
  section: 'claims' | 'loans' | 'projects' | 'emergency',
  page: number,
  pageSize: number,
) {
  return withSociety(scope, async (tx) => {
    await requireMember(tx, scope, memberId);
    const skip = (page - 1) * pageSize;
    if (section === 'claims') {
      const where = { societyId: scope.societyId, memberId };
      const [total, items] = await Promise.all([
        tx.claim.count({ where }),
        tx.claim.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      ]);
      return { page, pageSize, total, items: items.map((item) => row(item)) };
    }
    if (section === 'loans') {
      const where = { societyId: scope.societyId, memberId };
      const [total, items] = await Promise.all([
        tx.loanApplication.count({ where }),
        tx.loanApplication.findMany({ where, skip, take: pageSize }),
      ]);
      return { page, pageSize, total, items: items.map((item) => row(item)) };
    }
    if (section === 'projects') {
      const where = { societyId: scope.societyId, memberId };
      const [total, items] = await Promise.all([
        tx.projectParticipant.count({ where }),
        tx.projectParticipant.findMany({ where, skip, take: pageSize }),
      ]);
      const projects = await tx.project.findMany({
        where: { societyId: scope.societyId, id: { in: items.map((item) => item.projectId) } },
      });
      const names = new Map(projects.map((project) => [project.id, project.name]));
      return {
        page,
        pageSize,
        total,
        items: items.map((item) => ({ id: item.id, projectId: item.projectId, name: names.get(item.projectId) ?? '' })),
      };
    }
    const where = { societyId: scope.societyId, memberId };
    const [total, items] = await Promise.all([
      tx.emergencyRequest.count({ where }),
      tx.emergencyRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: { id: true, requestType: true, status: true, createdAt: true },
      }),
    ]);
    return { page, pageSize, total, items: items.map((item) => row(item)) };
  });
}

export async function listWhere(
  scope: Scope,
  page: number,
  pageSize: number,
  load: (tx: Prisma.TransactionClient, where: { societyId: string }) => Promise<[number, object[]]>,
) {
  return paged(scope, page, pageSize, (tx) => load(tx, { societyId: scope.societyId }));
}

export async function createLookup(
  scope: Scope,
  input: { listCode: string; code: string; label: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const created = await tx.lookupValue.create({
      data: { societyId: scope.societyId, ...input, createdBy: scope.userId },
    });
    await audit(tx, scope, 'lookups.created', 'lookup_value', created.id, traceId);
    return row(created);
  });
}

export async function createFamilyMember(
  scope: Scope,
  input: { givenName: string; familyName: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const created = await tx.familyMember.create({
      data: { societyId: scope.societyId, ...input, createdBy: scope.userId },
    });
    await audit(tx, scope, 'family.created', 'family_member', created.id, traceId);
    return row(created);
  });
}

export async function createFamilyLink(
  scope: Scope,
  input: { memberId: string; familyMemberId: string; relationshipCode: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const member = await tx.member.findFirst({ where: { id: input.memberId, societyId: scope.societyId } });
    const family = await tx.familyMember.findFirst({ where: { id: input.familyMemberId, societyId: scope.societyId } });
    if (!member || !family) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.memberFamilyLink.create({
      data: { societyId: scope.societyId, ...input, createdBy: scope.userId },
    });
    await audit(tx, scope, 'family.linked', 'member_family_link', created.id, traceId);
    return row(created);
  });
}

export async function createNamed(
  scope: Scope,
  kind: 'committee' | 'welfareScheme' | 'fund' | 'loanProduct' | 'project' | 'esgGoal',
  input: { name: string; category?: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const base = { societyId: scope.societyId, name: input.name, createdBy: scope.userId };
    const created =
      kind === 'committee'
        ? await tx.committee.create({ data: base })
        : kind === 'welfareScheme'
          ? await tx.welfareScheme.create({ data: base })
          : kind === 'fund'
            ? await tx.fund.create({ data: base })
            : kind === 'loanProduct'
              ? await tx.loanProduct.create({ data: base })
              : kind === 'esgGoal'
                ? await tx.esgGoal.create({ data: base })
                : await tx.project.create({ data: { ...base, category: input.category ?? 'general' } });
    await audit(tx, scope, `${kind}.created`, kind, created.id, traceId);
    return row(created);
  });
}

export async function createSchemeVersion(
  scope: Scope,
  schemeId: string,
  traceId: string,
  input?: { publish?: boolean; ruleBody?: unknown },
) {
  return withSociety(scope, async (tx) => {
    const scheme = await tx.welfareScheme.findFirst({ where: { id: schemeId, societyId: scope.societyId } });
    if (!scheme) throw new ApiError(404, 'not_found', 'errors.notFound');
    const count = await tx.welfareSchemeVersion.count({ where: { schemeId } });
    const publish = input?.publish === true;
    const ruleBody = publish ? (parseWelfareRule(input?.ruleBody) ?? DEFAULT_WELFARE_RULE) : {};
    const created = await tx.welfareSchemeVersion.create({
      data: {
        societyId: scope.societyId,
        schemeId,
        versionNo: count + 1,
        ruleBody,
        publishedAt: publish ? new Date() : null,
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'welfare.version_stored', 'welfare_scheme_version', created.id, traceId);
    return row(created);
  });
}

export async function createClaim(
  scope: Scope,
  input: {
    memberId: string;
    schemeVersionId: string;
    idempotencyKey: string;
    familyMemberId?: string;
    amount?: string;
    evidenceNote?: string;
    documents?: string[];
    contributionSatisfied?: boolean;
  },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const existing = await tx.claim.findFirst({
      where: { societyId: scope.societyId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) return row(existing);
    const version = await tx.welfareSchemeVersion.findFirst({
      where: { id: input.schemeVersionId, societyId: scope.societyId },
    });
    const member = await tx.member.findFirst({ where: { id: input.memberId, societyId: scope.societyId } });
    if (!version || !member) throw new ApiError(404, 'not_found', 'errors.notFound');
    let relationship: string | null = null;
    if (input.familyMemberId) {
      const link = await tx.memberFamilyLink.findFirst({
        where: { societyId: scope.societyId, memberId: input.memberId, familyMemberId: input.familyMemberId },
      });
      if (!link) throw new ApiError(404, 'not_found', 'errors.notFound');
      relationship = link.relationshipCode;
    }
    const rule = version.publishedAt ? parseWelfareRule(version.ruleBody) : null;
    let eligibilityStatus = 'not_calculated';
    let eligibilityReason = '';
    if (rule) {
      const priorClaims = await tx.claim.count({
        where: {
          societyId: scope.societyId,
          memberId: input.memberId,
          schemeVersionId: version.id,
          eligibilityStatus: 'eligible',
        },
      });
      const decision = evaluateWelfare({
        rule,
        memberStatus: member.statusCode,
        memberSince: member.createdAt,
        asOf: new Date(),
        relationship,
        amount: input.amount ?? null,
        documents: input.documents ?? [],
        priorClaims,
        contributionSatisfied: input.contributionSatisfied ?? !rule.contributionRequired,
      });
      eligibilityStatus = decision.status;
      eligibilityReason = decision.reason;
    }
    const created = await tx.claim.create({
      data: {
        societyId: scope.societyId,
        memberId: input.memberId,
        familyMemberId: input.familyMemberId,
        schemeVersionId: input.schemeVersionId,
        idempotencyKey: input.idempotencyKey,
        eligibilityStatus,
        eligibilityReason,
        evidenceNote: input.evidenceNote ?? '',
        amount: input.amount ?? null,
        createdBy: scope.userId,
      },
    });
    await tx.notificationDelivery.create({
      data: {
        societyId: scope.societyId,
        memberId: input.memberId,
        channel: 'in_app',
        status: 'delivered',
        messageKey: 'modules.welfare.hint',
        objectType: 'claim',
        objectId: created.id,
        createdBy: scope.userId,
      },
    });
    await tx.claimEvent.create({
      data: {
        societyId: scope.societyId,
        claimId: created.id,
        eventType: 'submitted',
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'claims.submitted', 'claim', created.id, traceId);
    return row(created);
  });
}

export async function listClaimEvents(scope: Scope, claimId: string) {
  return withSociety(scope, async (tx) => {
    const claim = await tx.claim.findFirst({ where: { id: claimId, societyId: scope.societyId } });
    if (!claim) throw new ApiError(404, 'not_found', 'errors.notFound');
    const events = await tx.claimEvent.findMany({ where: { societyId: scope.societyId, claimId }, orderBy: { createdAt: 'asc' } });
    const requests = await tx.approvalRequest.findMany({
      where: { societyId: scope.societyId, objectType: 'claim', objectId: claimId },
    });
    const decisions = await tx.approvalDecision.findMany({
      where: { societyId: scope.societyId, requestId: { in: requests.map((item) => item.id) } },
      orderBy: { createdAt: 'asc' },
    });
    return { claim: row(claim), events: events.map((item) => row(item)), decisions: decisions.map((item) => row(item)) };
  });
}

export async function createApprovalRoute(scope: Scope, name: string, traceId: string) {
  return withSociety(scope, async (tx) => {
    const created = await tx.approvalRoute.create({
      data: { societyId: scope.societyId, name, policyStatus: 'in_force', allowSelfApproval: false, createdBy: scope.userId },
    });
    await audit(tx, scope, 'approvals.route_stored', 'approval_route', created.id, traceId);
    return row(created);
  });
}

export async function createApprovalStage(
  scope: Scope,
  routeId: string,
  input: { stageNo: number; roleCode: string; amountNote?: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const route = await tx.approvalRoute.findFirst({ where: { id: routeId, societyId: scope.societyId } });
    if (!route) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.approvalRouteStage.create({
      data: { societyId: scope.societyId, routeId, ...input },
    });
    await audit(tx, scope, 'approvals.stage_stored', 'approval_route_stage', created.id, traceId);
    return row(created);
  });
}

export async function createApprovalDecision(
  scope: Scope,
  requestId: string,
  input: { stageNo: number; decision: 'approve' | 'reject' | 'return'; reason: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const request = await tx.approvalRequest.findFirst({ where: { id: requestId, societyId: scope.societyId } });
    if (!request) throw new ApiError(404, 'not_found', 'errors.notFound');
    if (request.createdBy === scope.userId) {
      const route = request.routeId
        ? await tx.approvalRoute.findFirst({ where: { id: request.routeId, societyId: scope.societyId } })
        : null;
      if (!route?.allowSelfApproval) throw new ApiError(403, 'self_approval', 'config.critical.selfApproval');
    }
    const created = await tx.approvalDecision.create({
      data: { societyId: scope.societyId, requestId, ...input, createdBy: scope.userId },
    });
    if (request.objectType === 'claim') {
      const nextStatus = input.decision === 'approve' ? 'approved' : input.decision === 'reject' ? 'rejected' : 'returned';
      await tx.claim.updateMany({
        where: { id: request.objectId, societyId: scope.societyId },
        data: { status: nextStatus },
      });
    }
    await audit(tx, scope, 'approvals.decided', 'approval_decision', created.id, traceId);
    return row(created);
  });
}

export async function createAccount(
  scope: Scope,
  input: { code: string; name: string; accountType: 'asset' | 'liability' | 'equity' | 'income' | 'expense' },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const created = await tx.account.create({
      data: { societyId: scope.societyId, ...input, createdBy: scope.userId },
    });
    await audit(tx, scope, 'ledger.account_created', 'account', created.id, traceId);
    return row(created);
  });
}

export async function createPeriod(
  scope: Scope,
  input: { name: string; startsOn: string; endsOn: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const created = await tx.fiscalPeriod.create({
      data: {
        societyId: scope.societyId,
        name: input.name,
        startsOn: new Date(input.startsOn),
        endsOn: new Date(input.endsOn),
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'ledger.period_created', 'fiscal_period', created.id, traceId);
    return row(created);
  });
}

export async function createJournal(scope: Scope, input: { periodId: string; reason: string }, traceId: string) {
  return withSociety(scope, async (tx) => {
    const period = await tx.fiscalPeriod.findFirst({ where: { id: input.periodId, societyId: scope.societyId } });
    if (!period) throw new ApiError(404, 'not_found', 'errors.notFound');
    if (period.status === 'closed') throw new ApiError(409, 'period_closed', 'modules.error.periodClosed');
    const created = await tx.journalDocument.create({
      data: { societyId: scope.societyId, periodId: input.periodId, reason: input.reason, createdBy: scope.userId },
    });
    await audit(tx, scope, 'ledger.journal_drafted', 'journal_document', created.id, traceId);
    return row(created);
  });
}

export async function addJournalLine(
  scope: Scope,
  documentId: string,
  input: { accountId: string; debit?: string; credit?: string; fundId?: string; memberId?: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const document = await tx.journalDocument.findFirst({ where: { id: documentId, societyId: scope.societyId } });
    const account = await tx.account.findFirst({ where: { id: input.accountId, societyId: scope.societyId } });
    if (!document || !account) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.journalLine.create({
      data: {
        societyId: scope.societyId,
        documentId,
        accountId: input.accountId,
        fundId: input.fundId,
        memberId: input.memberId,
        debit: new Prisma.Decimal(input.debit ?? '0'),
        credit: new Prisma.Decimal(input.credit ?? '0'),
      },
    });
    await audit(tx, scope, 'ledger.line_added', 'journal_line', created.id, traceId);
    return row(created);
  });
}

function journalFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('unbalanced')) throw new ApiError(409, 'unbalanced', 'modules.error.unbalanced');
  if (message.includes('posted_immutable')) throw new ApiError(409, 'immutable', 'modules.error.immutable');
  if (message.includes('period_closed')) throw new ApiError(409, 'period_closed', 'modules.error.periodClosed');
  if (message.includes('not_found') || message.includes('not_posted') || message.includes('not_draft')) {
    throw new ApiError(404, 'not_found', 'errors.notFound');
  }
  throw error instanceof Error ? error : new ApiError(500, 'error', 'errors.generic');
}

export async function postJournal(scope: Scope, documentId: string, traceId: string) {
  try {
    await withSociety(scope, async (tx) => {
      await tx.$executeRaw`SELECT app_post_journal(${documentId}::uuid, ${scope.societyId}::uuid, ${scope.userId}::uuid)`;
      await audit(tx, scope, 'ledger.posted', 'journal_document', documentId, traceId);
    });
  } catch (error) {
    journalFailure(error);
  }
}

export async function reverseJournal(scope: Scope, documentId: string, reason: string, traceId: string) {
  try {
    return await withSociety(scope, async (tx) => {
      const rows = await tx.$queryRaw<{ app_reverse_journal: string }[]>`
        SELECT app_reverse_journal(${documentId}::uuid, ${scope.societyId}::uuid, ${scope.userId}::uuid, ${reason})
      `;
      const id = rows[0]?.app_reverse_journal;
      if (!id) throw new ApiError(404, 'not_found', 'errors.notFound');
      await audit(tx, scope, 'ledger.reversed', 'journal_document', id, traceId);
      return { id };
    });
  } catch (error) {
    journalFailure(error);
  }
}

export async function createLoanVersion(
  scope: Scope,
  productId: string,
  traceId: string,
  input?: { publish?: boolean; ruleBody?: unknown },
) {
  return withSociety(scope, async (tx) => {
    const product = await tx.loanProduct.findFirst({ where: { id: productId, societyId: scope.societyId } });
    if (!product) throw new ApiError(404, 'not_found', 'errors.notFound');
    const count = await tx.loanProductVersion.count({ where: { productId } });
    const publish = input?.publish === true;
    const created = await tx.loanProductVersion.create({
      data: {
        societyId: scope.societyId,
        productId,
        versionNo: count + 1,
        ruleBody: publish ? (parseLoanRule(input?.ruleBody) ?? DEFAULT_LOAN_RULE) : {},
        publishedAt: publish ? new Date() : null,
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'loans.version_stored', 'loan_product_version', created.id, traceId);
    return row(created);
  });
}

export async function createLoanApplication(
  scope: Scope,
  input: { memberId: string; productVersionId: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const member = await tx.member.findFirst({ where: { id: input.memberId, societyId: scope.societyId } });
    const version = await tx.loanProductVersion.findFirst({
      where: { id: input.productVersionId, societyId: scope.societyId },
    });
    if (!member || !version) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.loanApplication.create({
      data: { societyId: scope.societyId, ...input, createdBy: scope.userId },
    });
    await audit(tx, scope, 'loans.application_recorded', 'loan_application', created.id, traceId);
    return row(created);
  });
}

const CHART = [
  ['1000', 'Cash', 'asset'],
  ['1100', 'Bank', 'asset'],
  ['1200', 'Contributions receivable', 'asset'],
  ['1300', 'Loans receivable', 'asset'],
  ['2000', 'Welfare payable', 'liability'],
  ['3000', 'Member fund', 'equity'],
  ['4000', 'Contribution income', 'income'],
  ['4100', 'Interest income', 'income'],
  ['5000', 'Welfare expense', 'expense'],
  ['5100', 'Project expense', 'expense'],
] as const;

export async function seedChart(scope: Scope, traceId: string) {
  return withSociety(scope, async (tx) => {
    const created: string[] = [];
    for (const [code, name, accountType] of CHART) {
      const existing = await tx.account.findFirst({ where: { societyId: scope.societyId, code } });
      if (existing) continue;
      const account = await tx.account.create({
        data: {
          societyId: scope.societyId,
          code,
          name,
          accountType,
          isCash: code === '1000' || code === '1100',
          createdBy: scope.userId,
        },
      });
      created.push(account.id);
    }
    await audit(tx, scope, 'ledger.chart_seeded', 'account', scope.societyId, traceId);
    return { created: created.length };
  });
}

export async function trialBalance(scope: Scope) {
  return withSociety(scope, async (tx) => {
    const accounts = await tx.account.findMany({ where: { societyId: scope.societyId }, orderBy: { code: 'asc' } });
    const posted = await tx.journalDocument.findMany({
      where: { societyId: scope.societyId, status: 'posted' },
      select: { id: true },
    });
    const lines = await tx.journalLine.findMany({
      where: { societyId: scope.societyId, documentId: { in: posted.map((item) => item.id) } },
    });
    const totals = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    for (const line of lines) {
      const current = totals.get(line.accountId) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
      current.debit = current.debit.plus(line.debit);
      current.credit = current.credit.plus(line.credit);
      totals.set(line.accountId, current);
    }
    let debit = new Prisma.Decimal(0);
    let credit = new Prisma.Decimal(0);
    const items = accounts.map((account) => {
      const sum = totals.get(account.id) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
      debit = debit.plus(sum.debit);
      credit = credit.plus(sum.credit);
      return { code: account.code, name: account.name, accountType: account.accountType, debit: sum.debit.toString(), credit: sum.credit.toString() };
    });
    return { items, debit: debit.toString(), credit: credit.toString(), balanced: debit.equals(credit) };
  });
}

export async function generateLoanSchedule(
  scope: Scope,
  applicationId: string,
  input: { principal: string; startOn: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const application = await tx.loanApplication.findFirst({ where: { id: applicationId, societyId: scope.societyId } });
    if (!application) throw new ApiError(404, 'not_found', 'errors.notFound');
    const version = await tx.loanProductVersion.findFirst({
      where: { id: application.productVersionId, societyId: scope.societyId },
    });
    const rule = version?.publishedAt ? parseLoanRule(version.ruleBody) : null;
    if (!rule) throw new ApiError(409, 'not_calculated', 'modules.error.notCalculated');
    await tx.loanScheduleLine.deleteMany({ where: { societyId: scope.societyId, applicationId } });
    const lines = buildSchedule(input.principal, rule, new Date(input.startOn));
    for (const line of lines) {
      await tx.loanScheduleLine.create({
        data: {
          societyId: scope.societyId,
          applicationId,
          installmentNo: line.installmentNo,
          dueOn: new Date(line.dueOn),
          principal: line.principal,
          interest: line.interest,
          fee: line.fee,
        },
      });
    }
    await audit(tx, scope, 'loans.schedule_generated', 'loan_application', applicationId, traceId);
    return { items: lines };
  });
}

export async function payClaim(
  scope: Scope,
  claimId: string,
  input: { periodId: string; expenseAccountId: string; cashAccountId: string; amount: string; reason: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const claim = await tx.claim.findFirst({ where: { id: claimId, societyId: scope.societyId } });
    if (!claim) throw new ApiError(404, 'not_found', 'errors.notFound');
    if (claim.status === 'paid') throw new ApiError(409, 'conflict', 'modules.error.immutable');
    if (claim.status !== 'approved' && claim.status !== 'payable') {
      throw new ApiError(409, 'conflict', 'errors.validation');
    }
    const document = await tx.journalDocument.create({
      data: { societyId: scope.societyId, periodId: input.periodId, reason: input.reason, createdBy: scope.userId },
    });
    await tx.journalLine.create({
      data: {
        societyId: scope.societyId,
        documentId: document.id,
        accountId: input.expenseAccountId,
        debit: new Prisma.Decimal(input.amount),
        credit: new Prisma.Decimal(0),
      },
    });
    await tx.journalLine.create({
      data: {
        societyId: scope.societyId,
        documentId: document.id,
        accountId: input.cashAccountId,
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(input.amount),
      },
    });
    await tx.$executeRaw`SELECT app_post_journal(${document.id}::uuid, ${scope.societyId}::uuid, ${scope.userId}::uuid)`;
    await tx.claim.update({ where: { id: claimId }, data: { status: 'paid' } });
    await audit(tx, scope, 'claims.paid', 'claim', claimId, traceId);
    return { id: claimId, journalDocumentId: document.id, status: 'paid' };
  });
}

export async function addProjectParticipant(
  scope: Scope,
  projectId: string,
  input: { memberId: string; familyMemberId?: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const project = await tx.project.findFirst({ where: { id: projectId, societyId: scope.societyId } });
    const member = await tx.member.findFirst({ where: { id: input.memberId, societyId: scope.societyId } });
    if (!project || !member) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.projectParticipant.create({
      data: { societyId: scope.societyId, projectId, memberId: input.memberId, familyMemberId: input.familyMemberId },
    });
    await audit(tx, scope, 'projects.participant_added', 'project_participant', created.id, traceId);
    return row(created);
  });
}

export async function addProjectExpense(
  scope: Scope,
  projectId: string,
  input: { description: string; amount: string; periodId?: string; expenseAccountId?: string; cashAccountId?: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const project = await tx.project.findFirst({ where: { id: projectId, societyId: scope.societyId } });
    if (!project) throw new ApiError(404, 'not_found', 'errors.notFound');
    let journalDocumentId: string | null = null;
    if (input.periodId && input.expenseAccountId && input.cashAccountId) {
      const document = await tx.journalDocument.create({
        data: {
          societyId: scope.societyId,
          periodId: input.periodId,
          reason: input.description,
          createdBy: scope.userId,
        },
      });
      await tx.journalLine.create({
        data: {
          societyId: scope.societyId,
          documentId: document.id,
          accountId: input.expenseAccountId,
          debit: new Prisma.Decimal(input.amount),
          credit: new Prisma.Decimal(0),
        },
      });
      await tx.journalLine.create({
        data: {
          societyId: scope.societyId,
          documentId: document.id,
          accountId: input.cashAccountId,
          debit: new Prisma.Decimal(0),
          credit: new Prisma.Decimal(input.amount),
        },
      });
      await tx.$executeRaw`SELECT app_post_journal(${document.id}::uuid, ${scope.societyId}::uuid, ${scope.userId}::uuid)`;
      journalDocumentId = document.id;
    }
    const created = await tx.projectExpense.create({
      data: {
        societyId: scope.societyId,
        projectId,
        description: input.description,
        amount: new Prisma.Decimal(input.amount),
        journalDocumentId,
      },
    });
    await audit(tx, scope, 'projects.expense_recorded', 'project_expense', created.id, traceId);
    return row(created);
  });
}

export async function createSuggestion(
  scope: Scope,
  input: { memberId: string; body: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const member = await tx.member.findFirst({ where: { id: input.memberId, societyId: scope.societyId } });
    if (!member) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.suggestion.create({
      data: { societyId: scope.societyId, memberId: input.memberId, body: input.body, createdBy: scope.userId },
    });
    await tx.suggestionEvent.create({
      data: { societyId: scope.societyId, suggestionId: created.id, status: 'submitted', createdBy: scope.userId },
    });
    await audit(tx, scope, 'suggestions.submitted', 'suggestion', created.id, traceId);
    return row(created);
  });
}

export async function decideSuggestion(
  scope: Scope,
  suggestionId: string,
  input: { status: 'accepted' | 'declined' | 'later'; projectId?: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const existing = await tx.suggestion.findFirst({ where: { id: suggestionId, societyId: scope.societyId } });
    if (!existing) throw new ApiError(404, 'not_found', 'errors.notFound');
    let projectId = input.projectId;
    if (input.status === 'accepted' && !projectId) {
      const project = await tx.project.create({
        data: {
          societyId: scope.societyId,
          name: existing.body.slice(0, 80),
          category: 'suggestion',
          createdBy: scope.userId,
        },
      });
      projectId = project.id;
    }
    const updated = await tx.suggestion.update({
      where: { id: suggestionId },
      data: { status: input.status, projectId },
    });
    await tx.suggestionEvent.create({
      data: {
        societyId: scope.societyId,
        suggestionId,
        status: input.status,
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'suggestions.decided', 'suggestion', suggestionId, traceId);
    return row(updated);
  });
}

export async function createEmergency(
  scope: Scope,
  input: {
    memberId: string;
    requestType: string;
    phone: string;
    description?: string;
    idempotencyKey: string;
    locationPermitted?: boolean;
  },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const existing = await tx.emergencyRequest.findFirst({
      where: { societyId: scope.societyId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) return row(existing);
    const member = await tx.member.findFirst({ where: { id: input.memberId, societyId: scope.societyId } });
    if (!member) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.emergencyRequest.create({
      data: {
        societyId: scope.societyId,
        memberId: input.memberId,
        requestType: input.requestType,
        phone: input.phone,
        description: input.description ?? '',
        idempotencyKey: input.idempotencyKey,
        locationPermitted: input.locationPermitted ?? false,
        status: 'submitted',
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'emergency.submitted', 'emergency_request', created.id, traceId);
    return row(created);
  });
}

export async function updateEmergency(
  scope: Scope,
  requestId: string,
  input: { note: string; status: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const request = await tx.emergencyRequest.findFirst({ where: { id: requestId, societyId: scope.societyId } });
    if (!request) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.emergencyUpdate.create({
      data: { societyId: scope.societyId, requestId, ...input, createdBy: scope.userId },
    });
    await tx.emergencyRequest.update({ where: { id: requestId }, data: { status: input.status } });
    await audit(tx, scope, 'emergency.updated', 'emergency_update', created.id, traceId);
    return row(created);
  });
}

export async function createKpi(scope: Scope, goalId: string, input: { name: string; unitLabel: string }, traceId: string) {
  return withSociety(scope, async (tx) => {
    const goal = await tx.esgGoal.findFirst({ where: { id: goalId, societyId: scope.societyId } });
    if (!goal) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.esgKpiDefinition.create({
      data: {
        societyId: scope.societyId,
        goalId,
        name: input.name,
        unitLabel: input.unitLabel,
        formulaBody: {},
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'esg.kpi_stored', 'esg_kpi_definition', created.id, traceId);
    return row(created);
  });
}

export function refuseEsgResult(): never {
  throw new ApiError(409, 'not_calculated', 'modules.error.notCalculated');
}

export async function verifySource(
  scope: Scope,
  input: { objectType: string; objectId: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const created = await tx.sourceVerification.create({
      data: { societyId: scope.societyId, objectType: input.objectType, objectId: input.objectId, createdBy: scope.userId },
    });
    await audit(tx, scope, 'esg.source_verified', input.objectType, input.objectId, traceId);
    return row(created);
  });
}

export async function recordEsgResult(
  scope: Scope,
  input: {
    measure: EsgMeasure;
    periodStart: string;
    periodEnd: string;
    kpiId?: string;
    sources: EsgSource[];
  },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const verified = await tx.sourceVerification.findMany({
      where: { societyId: scope.societyId, objectId: { in: input.sources.map((source) => source.id) } },
    });
    const verifiedIds = new Set(verified.map((item) => item.objectId));
    const result = calculateEsg(
      input.measure,
      input.sources.map((source) => ({ ...source, verified: verifiedIds.has(source.id) })),
    );
    const created = await tx.esgResult.create({
      data: {
        societyId: scope.societyId,
        kpiId: input.kpiId,
        measure: input.measure,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        verifiedTotal: result.verifiedTotal,
        unverifiedCount: result.unverifiedCount,
        sourceIds: result.sourceIds,
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'esg.result_recorded', 'esg_result', created.id, traceId);
    return { ...row(created), verifiedTotal: result.verifiedTotal, unverifiedCount: result.unverifiedCount, sourceIds: result.sourceIds };
  });
}

export async function createTemplate(
  scope: Scope,
  input: { code: string; language: 'en' | 'si' | 'ta'; body: string; channel?: string },
  traceId: string,
) {
  if (input.channel === 'whatsapp') {
    throw new ApiError(400, 'channel_disabled', 'modules.error.channelDisabled');
  }
  const channel = input.channel === 'email' || input.channel === 'sms' ? input.channel : 'in_app';
  return withSociety(scope, async (tx) => {
    const created = await tx.notificationTemplate.create({
      data: {
        societyId: scope.societyId,
        code: input.code,
        language: input.language,
        channel,
        body: input.body,
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'notifications.template_stored', 'notification_template', created.id, traceId);
    return row(created);
  });
}

type ImportRow = {
  memberNo: string;
  givenName: string;
  familyName: string;
  statusCode: string;
  categoryCode: string;
  employeeNo?: string;
  department?: string;
};

export async function importMembers(
  scope: Scope,
  input: { trial: boolean; rows: ImportRow[] },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const [statusCodes, categoryCodes, existing] = await Promise.all([
      lookupCodes(tx, scope.societyId, 'member_status'),
      lookupCodes(tx, scope.societyId, 'member_category'),
      tx.member.findMany({ where: { societyId: scope.societyId }, select: { memberNo: true } }),
    ]);
    const seen = new Set(existing.map((item) => item.memberNo));
    const rejected: { row: number; memberNo: string; messageKey: string }[] = [];
    input.rows.forEach((item, index) => {
      if (!item.memberNo || !item.givenName || !item.familyName) {
        rejected.push({ row: index + 1, memberNo: item.memberNo ?? '', messageKey: 'errors.validation' });
        return;
      }
      if (seen.has(item.memberNo)) {
        rejected.push({ row: index + 1, memberNo: item.memberNo, messageKey: 'errors.validation' });
        return;
      }
      if (!memberStatusAllowed(item.statusCode, null, statusCodes)) {
        rejected.push({ row: index + 1, memberNo: item.memberNo, messageKey: 'errors.validation' });
        return;
      }
      if (!knownCode(item.categoryCode, DEFAULT_MEMBER_CATEGORIES, categoryCodes)) {
        rejected.push({ row: index + 1, memberNo: item.memberNo, messageKey: 'errors.validation' });
        return;
      }
      seen.add(item.memberNo);
    });
    if (rejected.length > 0 || input.trial) {
      return { trial: input.trial, created: 0, rejected, accepted: input.rows.length - rejected.length };
    }
    for (const item of input.rows) {
      const created = await tx.member.create({
        data: {
          societyId: scope.societyId,
          memberNo: item.memberNo,
          givenName: item.givenName,
          familyName: item.familyName,
          employeeNo: item.employeeNo ?? '',
          department: item.department ?? '',
          statusCode: item.statusCode,
          categoryCode: item.categoryCode,
          createdBy: scope.userId,
          updatedBy: scope.userId,
        },
      });
      await tx.memberStatusHistory.create({
        data: {
          societyId: scope.societyId,
          memberId: created.id,
          statusCode: item.statusCode,
          reason: 'Imported',
          createdBy: scope.userId,
        },
      });
    }
    await audit(tx, scope, 'members.imported', 'member', scope.societyId, traceId);
    return { trial: false, created: input.rows.length, rejected: [], accepted: input.rows.length };
  });
}

export async function createAppointment(
  scope: Scope,
  committeeId: string,
  input: { memberId: string; roleTitle: string; startsOn: string; endsOn?: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const committee = await tx.committee.findFirst({ where: { id: committeeId, societyId: scope.societyId } });
    const member = await tx.member.findFirst({ where: { id: input.memberId, societyId: scope.societyId } });
    if (!committee || !member) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.committeeAppointment.create({
      data: {
        societyId: scope.societyId,
        committeeId,
        memberId: input.memberId,
        roleTitle: input.roleTitle,
        startsOn: new Date(input.startsOn),
        endsOn: input.endsOn ? new Date(input.endsOn) : null,
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'governance.appointed', 'committee_appointment', created.id, traceId);
    return row(created);
  });
}

export async function createMeeting(
  scope: Scope,
  committeeId: string,
  input: { title: string; heldOn: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const committee = await tx.committee.findFirst({ where: { id: committeeId, societyId: scope.societyId } });
    if (!committee) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.meeting.create({
      data: {
        societyId: scope.societyId,
        committeeId,
        title: input.title,
        heldOn: new Date(input.heldOn),
        createdBy: scope.userId,
      },
    });
    await audit(tx, scope, 'governance.meeting_recorded', 'meeting', created.id, traceId);
    return row(created);
  });
}

export async function createResolution(
  scope: Scope,
  meetingId: string,
  input: { title: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const meeting = await tx.meeting.findFirst({ where: { id: meetingId, societyId: scope.societyId } });
    if (!meeting) throw new ApiError(404, 'not_found', 'errors.notFound');
    const created = await tx.resolution.create({
      data: { societyId: scope.societyId, meetingId, title: input.title, createdBy: scope.userId },
    });
    await audit(tx, scope, 'governance.resolution_recorded', 'resolution', created.id, traceId);
    return row(created);
  });
}

export async function createGovernanceDocument(
  scope: Scope,
  input: { title: string; language: string; storageKey: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const created = await tx.governanceDocument.create({
      data: { societyId: scope.societyId, ...input, createdBy: scope.userId },
    });
    await audit(tx, scope, 'governance.document_recorded', 'governance_document', created.id, traceId);
    return row(created);
  });
}

export async function createApprovalRequest(
  scope: Scope,
  input: { objectType: string; objectId: string; routeId?: string },
  traceId: string,
) {
  return withSociety(scope, async (tx) => {
    const created = await tx.approvalRequest.create({
      data: { societyId: scope.societyId, ...input, createdBy: scope.userId },
    });
    await audit(tx, scope, 'approvals.requested', 'approval_request', created.id, traceId);
    return row(created);
  });
}
